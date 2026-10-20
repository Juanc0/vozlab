from __future__ import annotations

import json

import httpx
import pytest

from vozlab_worker.api import ApiClient
from vozlab_worker.retry import RetryPolicy
from vozlab_worker.streams import PermanentError, StreamMessage
from vozlab_worker.tokens import StaticTokenProvider
from worker_relacionador.handler import NodeCreatedHandler
from worker_relacionador.llm import Verdict

WORKSPACE_ID = "33333333-3333-4333-8333-333333333333"
NODE_ID = "22222222-2222-4222-8222-222222222222"
TARGET_ID = "11111111-1111-4111-8111-111111111111"

NODE = {
    "id": NODE_ID,
    "typeKey": "Problem",
    "title": "Late shuttle",
    "description": "Students wait too long",
    "status": "PENDING",
}
NEIGHBOR = {
    "id": TARGET_ID,
    "typeKey": "Idea",
    "title": "Shuttle service",
    "description": "More frequent buses",
    "status": "ACTIVE",
    "similarity": 0.91,
}
ONTOLOGY = {
    "classes": [],
    "objectProperties": [
        {
            "systemKey": "RELATES_TO",
            "domainClassKey": "Problem",
            "rangeClassKey": "Idea",
            "isSymmetric": False,
        }
    ],
}


def make_message(**overrides: str) -> StreamMessage:
    fields = {
        "reqId": "req-1",
        "nodeId": NODE_ID,
        "workspaceId": WORKSPACE_ID,
        "typeKey": "Problem",
        "title": "Late shuttle",
    }
    fields.update(overrides)
    return StreamMessage(id="1-0", fields=fields)


class StubChat:
    def __init__(self, verdict: Verdict) -> None:
        self.verdict = verdict
        self.calls = 0

    def decide(self, _node, _neighbors) -> Verdict:
        self.calls += 1
        return self.verdict


def make_handler(
    *,
    verdict: Verdict | None = None,
    neighbors: list[dict] | None = None,
    edges: list[dict] | None = None,
    ontology: dict | None = None,
    neighbors_status: int = 200,
    edge_status: int = 201,
    proposal_status: int = 201,
) -> tuple[NodeCreatedHandler, StubChat, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def api_handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path.endswith("/neighbors"):
            if neighbors_status != 200:
                return httpx.Response(neighbors_status, json={"code": "ERR_NODE_NOT_EMBEDDED"})
            payload = [NEIGHBOR] if neighbors is None else neighbors
            return httpx.Response(200, json={"node": NODE, "neighbors": payload})
        if path == "/api/v1/ontology":
            return httpx.Response(200, json=ontology if ontology is not None else ONTOLOGY)
        if path == "/api/v1/edges" and request.method == "GET":
            return httpx.Response(200, json={"edges": edges or [], "nextCursor": None})
        if path == "/api/v1/edges" and request.method == "POST":
            if edge_status != 201:
                return httpx.Response(edge_status, json={"code": "ERR_VALIDATION_FAILED"})
            return httpx.Response(
                201,
                json={
                    "id": "edge-1",
                    "sourceNodeId": NODE_ID,
                    "targetNodeId": TARGET_ID,
                    "relationKey": "RELATES_TO",
                    "status": "PENDING",
                },
            )
        if path == "/api/v1/proposals" and request.method == "POST":
            if proposal_status != 201:
                return httpx.Response(proposal_status, json={"code": "ERR_VALIDATION_FAILED"})
            return httpx.Response(
                201,
                json={
                    "id": "proposal-1",
                    "targetId": NODE_ID,
                    "targetType": "NODE",
                    "kind": "MERGE",
                    "status": "PENDING",
                },
            )
        raise AssertionError(f"unexpected request: {request.method} {path}")

    api = ApiClient(
        "http://api.test",
        StaticTokenProvider("token-123"),
        transport=httpx.MockTransport(api_handler),
        retry_policy=RetryPolicy(
            attempts=2,
            base_delay_seconds=0,
            max_delay_seconds=0,
            jitter_seconds=0,
        ),
    )
    chat = StubChat(verdict or Verdict(action="EDGE", target_id=TARGET_ID, reason="same topic"))
    handler = NodeCreatedHandler(api, chat)  # type: ignore[arg-type]
    return handler, chat, requests


def test_an_edge_verdict_creates_a_pending_edge() -> None:
    handler, _chat, requests = make_handler()

    handler(make_message())

    posts = [r for r in requests if r.method == "POST"]
    assert len(posts) == 1
    body = json.loads(posts[0].content)
    assert body == {
        "sourceNodeId": NODE_ID,
        "targetNodeId": TARGET_ID,
        "relationKey": "RELATES_TO",
    }
    assert posts[0].headers["x-workspace-id"] == WORKSPACE_ID
    assert posts[0].headers["x-correlation-id"] == "req-1"


def test_an_independent_verdict_creates_nothing() -> None:
    handler, _chat, requests = make_handler(
        verdict=Verdict(action="INDEPENDENT", target_id=None, reason="unique")
    )

    handler(make_message())

    assert [r for r in requests if r.method == "POST"] == []


def test_a_merge_verdict_submits_a_merge_proposal() -> None:
    handler, _chat, requests = make_handler(
        verdict=Verdict(action="MERGE", target_id=TARGET_ID, reason="duplicate")
    )

    handler(make_message())

    # ADR-0026: a merge is a proposal, not a direct write.
    posts = [r for r in requests if r.method == "POST"]
    assert len(posts) == 1
    assert posts[0].url.path == "/api/v1/proposals"
    body = json.loads(posts[0].content)
    assert body == {
        "kind": "MERGE",
        "targetId": NODE_ID,
        "targetType": "NODE",
        "proposedChanges": {"mergeIntoNodeId": TARGET_ID},
        "justification": "duplicate",
    }
    assert posts[0].headers["x-workspace-id"] == WORKSPACE_ID
    assert posts[0].headers["x-correlation-id"] == "req-1"


def test_a_merge_that_is_already_proposed_is_not_retried() -> None:
    handler, _chat, requests = make_handler(
        verdict=Verdict(action="MERGE", target_id=TARGET_ID, reason="duplicate"),
        proposal_status=409,
    )

    handler(make_message())

    # The API answered "already proposed": the entry is acknowledged.
    assert [r for r in requests if r.method == "POST"]


def test_a_rejected_merge_proposal_is_permanent() -> None:
    handler, _chat, _requests = make_handler(
        verdict=Verdict(action="MERGE", target_id=TARGET_ID, reason="duplicate"),
        proposal_status=422,
    )

    with pytest.raises(PermanentError):
        handler(make_message())


def test_without_neighbours_the_model_is_not_asked() -> None:
    handler, chat, requests = make_handler(neighbors=[])

    handler(make_message())

    assert chat.calls == 0
    assert [r for r in requests if r.method == "POST"] == []


def test_a_node_without_an_embedding_is_retryable() -> None:
    handler, _chat, _requests = make_handler(neighbors_status=409)

    with pytest.raises(RuntimeError) as raised:
        handler(make_message())

    assert not isinstance(raised.value, PermanentError)
    assert "embedding" in str(raised.value)


def test_a_missing_node_is_permanent() -> None:
    handler, _chat, _requests = make_handler(neighbors_status=404)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_without_a_matching_relation_no_edge_is_created() -> None:
    handler, _chat, requests = make_handler(
        ontology={
            "classes": [],
            "objectProperties": [
                {
                    "systemKey": "RELATES_TO",
                    "domainClassKey": "Resource",
                    "rangeClassKey": "Idea",
                    "isSymmetric": False,
                }
            ],
        }
    )

    handler(make_message())

    assert [r for r in requests if r.method == "POST"] == []


def test_an_existing_edge_is_not_duplicated() -> None:
    handler, _chat, requests = make_handler(
        edges=[
            {
                "id": "edge-1",
                "sourceNodeId": NODE_ID,
                "targetNodeId": TARGET_ID,
                "relationKey": "RELATES_TO",
            }
        ]
    )

    handler(make_message())

    assert [r for r in requests if r.method == "POST"] == []


def test_a_rejected_edge_is_permanent() -> None:
    handler, _chat, _requests = make_handler(edge_status=422)

    with pytest.raises(PermanentError):
        handler(make_message())


def test_an_event_without_a_node_id_is_permanent() -> None:
    handler, _chat, _requests = make_handler()

    with pytest.raises(PermanentError):
        handler(make_message(nodeId=""))
