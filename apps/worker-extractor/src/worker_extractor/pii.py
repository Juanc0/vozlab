"""Local PII masking (NFR-06).

The rule is hard: **no raw record content may leave the worker**. Everything
here runs locally, before the text is sent to the LLM, and the masked text is
what the model sees.

The masker is deliberately conservative about *structure* and aggressive about
*identifiers*: over-masking costs a little context, under-masking leaks
personal data. It is rule-based (no model call, no network) and therefore
imperfect:

- emails, phone numbers, long digit runs and id-like groups are masked
  reliably;
- personal names are detected heuristically (two or more capitalised words
  that are not institutional terms), so a name that looks like a common noun
  is not masked. The trade-off is documented in the spec.
"""

from __future__ import annotations

import re

MASK = "[MASKED]"

#: Words that are capitalised because they are names of things, not people.
#: Without this list, every "Campus Shuttle" would look like a person.
_NOT_A_NAME = frozenset(
    {
        # English
        "action",
        "agenda",
        "board",
        "campus",
        "city",
        "committee",
        "council",
        "department",
        "faculty",
        "group",
        "health",
        "housing",
        "item",
        "lab",
        "labs",
        "library",
        "meeting",
        "minutes",
        "new",
        "note",
        "notes",
        "plan",
        "program",
        "programme",
        "project",
        "quality",
        "region",
        "report",
        "research",
        "safety",
        "school",
        "service",
        "services",
        "space",
        "student",
        "students",
        "team",
        "that",
        "the",
        "these",
        "this",
        "those",
        "transport",
        "transportation",
        "university",
        "we",
        "wifi",
        # Spanish
        "acta",
        "actas",
        "asunto",
        "comision",
        "comité",
        "consejo",
        "departamento",
        "documento",
        "edificio",
        "equipo",
        "escuela",
        "facultad",
        "informe",
        "laboratorio",
        "reunion",
        "reunión",
        "servicio",
        "universidad",
    }
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Compact international number, e.g. "+34600123456".
_PHONE_INTL = re.compile(r"(?<![\w+])\+\d{8,15}(?![\w])")
# Spaced, grouped or parenthesised number, e.g. "+34 600 123 456" or
# "(555) 010 1234". The trailing lookahead is `\w` only: a sentence-ending
# period must not cut the number short and leave digits behind.
_PHONE = re.compile(
    r"(?<![\w])(?:\+\d{1,3}[\s.\-]?)?(?:\(\d{2,4}\)[\s.\-]?)?"
    r"\d{2,4}(?:[\s.\-]\d{2,4}){1,3}(?![\w])"
)
_LONG_DIGITS = re.compile(r"(?<!\w)\d{8,19}(?!\w)")
_ID_GROUP = re.compile(r"(?<!\w)\d{3}-\d{3,4}-\d{2,4}(?!\w)")
_NAME = re.compile(r"\b[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)+\b")


def _mask_phone(match: re.Match[str]) -> str:
    """Mask phone-like groups only when they carry at least seven digits.

    The digit count is checked because a short grouped number ("2026 2027")
    is not a phone number.
    """
    candidate = match.group(0)
    if sum(char.isdigit() for char in candidate) < 7:
        return candidate
    return MASK


def _mask_name(match: re.Match[str]) -> str:
    """Mask a capitalised sequence unless it contains an institutional term."""
    words = match.group(0).split()
    if any(word.lower() in _NOT_A_NAME for word in words):
        return match.group(0)
    return MASK


def mask_pii(text: str) -> str:
    """Return `text` with the detectable identifiers replaced by `[MASKED]`."""
    if not text:
        return text

    masked = _EMAIL.sub(MASK, text)
    masked = _PHONE_INTL.sub(MASK, masked)
    masked = _PHONE.sub(_mask_phone, masked)
    masked = _ID_GROUP.sub(MASK, masked)
    masked = _LONG_DIGITS.sub(MASK, masked)
    masked = _NAME.sub(_mask_name, masked)
    return masked


def contains_pii(text: str) -> bool:
    """True when `text` still contains something the masker would catch."""
    return mask_pii(text) != text
