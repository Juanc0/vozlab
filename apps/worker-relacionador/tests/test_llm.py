from __future__ import annotations

import json

import httpx
import pytest

from worker_relacionador.llm import LlmError, OllamaChat

NEIGHBORS = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "typeKey": "Idea",
        "title": "Shuttle service",
        "description": "More frequent buses",
        "similarity": 0.91,
    }
]
NODE = {
    "id": "22222222-2222-4222-8222-222222222222",
    "typeKey": "Problem",
    "title": "Late shuttle",
    "description": "Students wait too long",
}


def make_chat(handler) -> OllamaChat:
    return OllamaChat(
        "http://ollama.test",
        "llama3.1:8b",
        transport=httpx.MockTransport(handler),
    )


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"message": {"role": "assistant", "content": content}})


def test_valid_edge_verdict_is_parsed() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(
            json.dumps(
                {
                    "action": "EDGE",
                    "targetId": NEIGHBORS[0]["id"],
                    "reason": "same topic",
                }
            )
        )

    chat = make_chat(handler)
    verdict = chat.decide(NODE, NEIGHBORS)

    assert verdict.action == "EDGE"
    assert verdict.target_id == NEIGHBORS[0]["id"]
    assert verdict.reason == "same topic"


def test_independent_verdict_drops_the_target() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(
            json.dumps({"action": "INDEPENDENT", "targetId": "whatever", "reason": "unique"})
        )

    chat = make_chat(handler)
    verdict = chat.decide(NODE, NEIGHBORS)

    assert verdict.action == "INDEPENDENT"
    assert verdict.target_id is None


def test_the_prompt_contains_the_node_and_the_neighbours() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return chat_response(
            json.dumps({"action": "INDEPENDENT", "targetId": None, "reason": "ok"})
        )

    chat = make_chat(handler)
    chat.decide(NODE, NEIGHBORS)

    body = bodies[0]
    assert body["model"] == "llama3.1:8b"
    assert body["stream"] is False
    assert body["format"] == "json"
    prompt = body["messages"][1]["content"]
    assert "Late shuttle" in prompt
    assert NEIGHBORS[0]["id"] in prompt


def test_a_hallucinated_target_is_rejected() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(
            json.dumps(
                {
                    "action": "EDGE",
                    "targetId": "99999999-9999-4999-8999-999999999999",
                    "reason": "invented",
                }
            )
        )

    chat = make_chat(handler)

    with pytest.raises(LlmError, match="hallucinated"):
        chat.decide(NODE, NEIGHBORS)


def test_an_unknown_action_is_rejected() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(json.dumps({"action": "MAYBE", "targetId": None, "reason": ""}))

    chat = make_chat(handler)

    with pytest.raises(LlmError, match="unknown action"):
        chat.decide(NODE, NEIGHBORS)


def test_a_non_json_answer_is_rejected() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response("I think it is related to the other one")

    chat = make_chat(handler)

    with pytest.raises(LlmError, match="JSON"):
        chat.decide(NODE, NEIGHBORS)


def test_a_server_error_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="model loading")

    chat = make_chat(handler)

    with pytest.raises(LlmError):
        chat.decide(NODE, NEIGHBORS)


def test_a_transport_error_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    chat = make_chat(handler)

    with pytest.raises(LlmError):
        chat.decide(NODE, NEIGHBORS)
