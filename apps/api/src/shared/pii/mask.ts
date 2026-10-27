/**
 * PII masking for the ingestion producer (ADR-0035).
 *
 * Applied before the raw payload enters `stream:source_raw`, so PII never
 * reaches Redis or the Extractor worker. The Extractor keeps its own masker
 * as defense in depth (no-op if already masked).
 *
 * Heuristic: regex for emails, phones, document numbers, and a best-effort
 * name masker. Personal names are NOT reliably detected (NFR-06 Partial) —
 * this is a known limit, not a guarantee.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
const DOC_RE = /\b\d{6,12}\b/g;

// Best-effort name masker: sequences of 2+ capitalized words.
const NAME_RE = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)\b/g;

export function maskPii(text: string): string {
  if (!text) return text;
  let result = text;
  result = result.replace(EMAIL_RE, '[EMAIL]');
  result = result.replace(PHONE_RE, '[PHONE]');
  result = result.replace(DOC_RE, '[ID]');
  result = result.replace(NAME_RE, '[NAME]');
  return result;
}

export function maskPayload(payload: unknown): unknown {
  if (typeof payload === 'string') return maskPii(payload);
  if (Array.isArray(payload)) return payload.map(maskPayload);
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = maskPayload(value);
    }
    return out;
  }
  return payload;
}