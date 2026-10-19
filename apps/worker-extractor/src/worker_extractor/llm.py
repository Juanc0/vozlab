"""LLM extraction: turn a masked record into a draft node.

The model is asked for strict JSON:

    {"title": "...", "description": "...", "attributes": {...}, "typeKey": "..."}

Everything it returns is validated before it can reach the API: a title that
is unusable is replaced by a deterministic fallback derived from the masked
text, so a hallucinated or truncated title can never create a broken node.
"""

from __future__ import annotations

import json

import httpx

from .models import ExtractedNodePayload

_SYSTEM_PROMPT = (
    "You turn institutional listening records into knowledge-graph drafts. "
    'Answer with a single JSON object and nothing else: {"title": "<max 120 '
    'chars>", "description": "<max 600 chars>", "attributes": {<string: '
    'string>}, "typeKey": "<one ontology class key>"}. Use the ontology key '
    "that fits the record best; do not invent facts that are not in the text."
)

#: The API rejects titles outside this range (`CreateNodeSchema`).
MIN_TITLE = 3
MAX_TITLE = 255


class ExtractionError(RuntimeError):
    """The model call failed or its answer could not be used.

    Retryable: the stream entry stays pending and is recovered with
    `XAUTOCLAIM` (ADR-0021).
    """


class OllamaExtractor:
    """Extraction client for the local Ollama model."""

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        temperature: float = 0.0,
        timeout_seconds: float = 60.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
        )
        self._model = model
        self._temperature = temperature

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> OllamaExtractor:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def extract(self, masked_text: str, channel_name: str) -> ExtractedNodePayload:
        """Return the draft node for `masked_text` (already PII-masked)."""
        content = self._ask(masked_text, channel_name)
        return self._parse(content, masked_text)

    # --- internals ----------------------------------------------------

    def _ask(self, masked_text: str, channel_name: str) -> str:
        prompt = f"Channel: {channel_name}\n\nRecord:\n{masked_text}\n\nReturn the JSON object."
        try:
            response = self._client.post(
                "/api/chat",
                json={
                    "model": self._model,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": self._temperature},
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
        except httpx.TransportError as exc:
            raise ExtractionError(f"ollama is unreachable: {exc}") from exc

        if response.status_code >= 500:
            raise ExtractionError(f"ollama returned {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise ExtractionError(f"ollama rejected the request: {response.text[:200]}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise ExtractionError("ollama returned a non-JSON response") from exc

        message = payload.get("message") if isinstance(payload, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise ExtractionError("ollama returned no message content")
        return content

    @staticmethod
    def _parse(content: str, masked_text: str) -> ExtractedNodePayload:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ExtractionError(f"the model did not answer with JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise ExtractionError("the model answer is not a JSON object")

        title = payload.get("title")
        if not isinstance(title, str) or not title.strip():
            # A title is mandatory, but a model that forgot it must not lose the
            # record: fall back to the masked text itself.
            title = fallback_title(masked_text)

        description = payload.get("description")
        if not isinstance(description, str):
            description = ""

        attributes = payload.get("attributes")
        if not isinstance(attributes, dict):
            attributes = {}

        type_key = payload.get("typeKey")
        if not isinstance(type_key, str) or not type_key.strip():
            type_key = "Problem"

        return ExtractedNodePayload(
            typeKey=type_key.strip(),
            title=title.strip()[:MAX_TITLE],
            description=description.strip(),
            attributes={str(k): v for k, v in attributes.items()},
        )


def fallback_title(masked_text: str) -> str:
    """A deterministic title for a record the model did not summarise."""
    first_line = masked_text.strip().splitlines()[0] if masked_text.strip() else ""
    if not first_line:
        raise ExtractionError("the record has no usable text")
    if len(first_line) < MIN_TITLE:
        first_line = masked_text.strip().replace("\n", " ")
    return first_line[:MAX_TITLE]
