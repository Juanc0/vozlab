import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, apiUrl, normalizeApiBaseUrl } from '$lib/config/api-base-url';

describe('normalizeApiBaseUrl', () => {
  it('falls back to the local default when nothing is configured', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl(null)).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl('   ')).toBe(DEFAULT_API_BASE_URL);
  });

  it('keeps a valid absolute URL', () => {
    expect(normalizeApiBaseUrl('https://api.vozlab.example/api/v1')).toBe(
      'https://api.vozlab.example/api/v1'
    );
  });

  it('strips trailing slashes', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/api/v1/')).toBe('http://localhost:3000/api/v1');
    expect(normalizeApiBaseUrl('http://localhost:3000/api/v1///')).toBe('http://localhost:3000/api/v1');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeApiBaseUrl('  http://localhost:3000/api/v1  ')).toBe('http://localhost:3000/api/v1');
  });

  it('accepts relative paths and rejects non-http(s) schemes', () => {
    expect(normalizeApiBaseUrl('/api/v1')).toBe('/api/v1');
    expect(normalizeApiBaseUrl('api/v1')).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl('ftp://api.vozlab.example')).toBe(DEFAULT_API_BASE_URL);
    expect(normalizeApiBaseUrl('javascript:alert(1)')).toBe(DEFAULT_API_BASE_URL);
  });
});

describe('apiUrl', () => {
  it('joins the base URL and the path with exactly one slash', () => {
    expect(apiUrl('http://localhost:3000/api/v1', '/nodes')).toBe(
      'http://localhost:3000/api/v1/nodes'
    );
    expect(apiUrl('http://localhost:3000/api/v1', 'nodes')).toBe(
      'http://localhost:3000/api/v1/nodes'
    );
    expect(apiUrl('http://localhost:3000/api/v1/', '/nodes')).toBe(
      'http://localhost:3000/api/v1/nodes'
    );
  });

  it('keeps the query string of the path', () => {
    expect(apiUrl('http://localhost:3000/api/v1', '/nodes?limit=20')).toBe(
      'http://localhost:3000/api/v1/nodes?limit=20'
    );
  });
});
