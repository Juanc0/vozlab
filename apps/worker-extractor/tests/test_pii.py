from __future__ import annotations

from worker_extractor.pii import MASK, contains_pii, mask_pii


def test_emails_are_masked() -> None:
    masked = mask_pii("Contact maria.lopez@example.edu for details")

    assert "maria.lopez@example.edu" not in masked
    assert MASK in masked


def test_phone_numbers_are_masked() -> None:
    masked = mask_pii("Call +34 600 123 456 tomorrow")

    assert "600 123 456" not in masked
    assert MASK in masked


def test_a_phone_at_the_end_of_a_sentence_is_fully_masked() -> None:
    # A trailing period must not cut the number short and leave digits behind.
    masked = mask_pii("Contact +34 600 123 456.")

    assert "456" not in masked
    assert masked == "Contact [MASKED]."


def test_a_compact_international_number_is_masked() -> None:
    masked = mask_pii("Call +34600123456 now")

    assert "600123456" not in masked
    assert MASK in masked


def test_a_parenthesised_number_is_masked() -> None:
    masked = mask_pii("Call (555) 010 1234 today")

    assert "010 1234" not in masked
    assert MASK in masked


def test_long_digit_runs_are_masked() -> None:
    masked = mask_pii("National id 123456789012")

    assert "123456789012" not in masked
    assert MASK in masked


def test_id_like_groups_are_masked() -> None:
    masked = mask_pii("Licence 123-456-78 expires soon")

    assert "123-456-78" not in masked
    assert MASK in masked


def test_personal_names_are_masked() -> None:
    masked = mask_pii("The complaint was filed by María López yesterday")

    assert "María López" not in masked
    assert MASK in masked


def test_institutional_terms_are_kept() -> None:
    text = "Campus Shuttle service will change after the Committee meeting"

    assert mask_pii(text) == text


def test_short_numbers_are_kept() -> None:
    text = "In 2026 the campus will host 3 events"

    assert mask_pii(text) == text


def test_masking_is_idempotent() -> None:
    text = "Reach Ana Torres at ana.torres@example.edu about case 123456789"

    once = mask_pii(text)
    assert mask_pii(once) == once


def test_empty_text_stays_empty() -> None:
    assert mask_pii("") == ""
    assert contains_pii("") is False
