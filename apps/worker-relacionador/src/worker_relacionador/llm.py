"""LLM evaluation: ask a local model for a relationship verdict.

The model is prompted with the new node and its closest neighbours and must
answer with strict JSON:

    {"action": "MERGE | EDGE | INDEPENDENT", "targetId": "<uuid or null>",
     "reason": "<short explanation>"}

Everything the model returns is validated before anything is written
(ADR-0023): a hallucinated target id is a model failure, never a write.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

#: The three verdicts the Relator understands.
ACTIONS = ("MERGE", "EDGE", "INDEPENDENT")

_SYSTEM_PROMPT = (
    "You are a knowledge-graph curator. You compare a new node with its closest "
    "neighbours and decide how they relate. Answer with a single JSON object "
    'and nothing else: {"action": "MERGE | EDGE | INDEPENDENT", "targetId": '
    '"<uuid or null>", "reason": "<max 20 words>"}. Use MERGE when the new node '
    "duplicates a neighbour, EDGE when it is genuinely related to one, and "
    "INDEPENDENT when it stands on its own. targetId must be null for "
    "INDEPENDENT and must be one of the neighbour ids otherwise."
)


class LlmError(RuntimeError):
    """The model call failed or the verdict could not be validated.

    Retryable by default: the stream entry stays pending and is recovered with
    `XAUTOCLAIM` (ADR-0021).
    """


@dataclass(frozen=True, slots=True)
class Verdict:
    """A validated model verdict."""

    action: str
    target_id: str | None
    reason: str


class OllamaChat:
    """Chat client for the local Ollama model."""

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

    def __enter__(self) -> OllamaChat:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def decide(self, node: dict[str, Any], neighbors: list[dict[str, Any]]) -> Verdict:
        """Return the validated verdict for `node` against `neighbors`."""
        content = self._ask(self._build_prompt(node, neighbors))
        return self._parse(content, {n["id"] for n in neighbors})

    # --- internals ----------------------------------------------------

    def _build_prompt(self, node: dict[str, Any], neighbors: list[dict[str, Any]]) -> str:
        lines = [
            "New node:",
            f"- id: {node.get('id')}",
            f"- class: {node.get('typeKey')}",
            f"- title: {node.get('title')}",
            f"- description: {node.get('description') or '(none)'}",
            "",
            "Closest neighbours:",
        ]
        for neighbor in neighbors:
            lines.append(
                f"- id: {neighbor.get('id')} | class: {neighbor.get('typeKey')} | "
                f"similarity: {neighbor.get('similarity')} | title: {neighbor.get('title')} | "
                f"description: {neighbor.get('description') or '(none)'}"
            )
        return "\n".join(lines)

    def _ask(self, prompt: str) -> str:
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
            raise LlmError(f"ollama is unreachable: {exc}") from exc

        if response.status_code >= 500:
            raise LlmError(f"ollama returned {response.status_code}: {response.text[:200]}")
        if response.status_code >= 400:
            raise LlmError(f"ollama rejected the request: {response.text[:200]}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise LlmError("ollama returned a non-JSON response") from exc

        message = payload.get("message") if isinstance(payload, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise LlmError("ollama returned no message content")
        return content

    @staticmethod
    def _parse(content: str, neighbor_ids: set[str]) -> Verdict:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise LlmError(f"the model did not answer with JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise LlmError("the model answer is not a JSON object")

        action = payload.get("action")
        if action not in ACTIONS:
            raise LlmError(f"the model answered with an unknown action: {action!r}")

        target_id = payload.get("targetId")
        if target_id is not None and not isinstance(target_id, str):
            raise LlmError("the model answered with a non-string targetId")

        if action == "INDEPENDENT":
            target_id = None
        else:
            # A hallucinated target is rejected: it must be one of the
            # neighbours the API returned.
            if target_id not in neighbor_ids:
                raise LlmError(f"the model hallucinated a target: {target_id!r}")

        reason = payload.get("reason")
        if not isinstance(reason, str):
            reason = ""

        return Verdict(action=action, target_id=target_id, reason=reason.strip())
