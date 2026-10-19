from __future__ import annotations

import json

import httpx
import pytest

from worker_extractor.llm import ExtractionError, OllamaExtractor, fallback_title


def make_extractor(handler) -> OllamaExtractor:
    return OllamaExtractor(
        "http://ollama.test",
        "llama3.1:8b",
        transport=httpx.MockTransport(handler),
    )


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"message": {"role": "assistant", "content": content}})


def test_a_valid_answer_becomes_a_payload() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(
            json.dumps(
                {
                    "title": "Students wait 40 minutes for the shuttle",
                    "description": "The inter-campus shuttle leaves every hour.",
                    "attributes": {"impact": "high"},
                    "typeKey": "Problem",
                }
            )
        )

    extractor = make_extractor(handler)
    payload = extractor.extract("masked text", "meeting-minutes")

    assert payload.type_key == "Problem"
    assert payload.title == "Students wait 40 minutes for the shuttle"
    assert payload.description == "The inter-campus shuttle leaves every hour."
    assert payload.attributes == {"impact": "high"}


def test_a_missing_title_falls_back_to_the_masked_text() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(json.dumps({"description": "no title here"}))

    extractor = make_extractor(handler)
    payload = extractor.extract("The shuttle leaves every hour", "channel")

    assert payload.title == "The shuttle leaves every hour"
    assert payload.type_key == "Problem"


def test_a_suggested_type_key_is_kept_and_validated_by_the_handler() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response(
            json.dumps({"title": "A title", "typeKey": "Invented", "attributes": []})
        )

    extractor = make_extractor(handler)
    payload = extractor.extract("text", "channel")

    # The client does not know the workspace ontology; the handler checks the
    # key against it and falls back to the default class.
    assert payload.type_key == "Invented"
    assert payload.attributes == {}


def test_a_non_json_answer_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return chat_response("I cannot summarise this record")

    extractor = make_extractor(handler)

    with pytest.raises(ExtractionError):
        extractor.extract("text", "channel")


def test_a_server_error_is_retryable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="model loading")

    extractor = make_extractor(handler)

    with pytest.raises(ExtractionError):
        extractor.extract("text", "channel")


def test_the_prompt_carries_the_masked_text() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return chat_response(json.dumps({"title": "A title"}))

    extractor = make_extractor(handler)
    extractor.extract("masked record text", "meeting-minutes")

    body = bodies[0]
    assert body["model"] == "llama3.1:8b"
    assert body["format"] == "json"
    prompt = body["messages"][1]["content"]
    assert "masked record text" in prompt
    assert "meeting-minutes" in prompt


def test_fallback_title_of_empty_text_fails() -> None:
    with pytest.raises(ExtractionError):
        fallback_title("   ")
