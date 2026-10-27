// k6 smoke load test for the VozLab API (NFR-01/02/03 sanity).
// Run: k6 run scripts/load/k6-smoke.js
// Requires the API on http://localhost:3000 and a valid dev token.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE = __ENV.API_URL || 'http://localhost:3000';
const TOKEN = __ENV.API_TOKEN || '';
const WORKSPACE = __ENV.WORKSPACE_ID || '33333333-3333-4333-8333-333333333333';

export default function () {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'X-Workspace-ID': WORKSPACE,
  };

  const health = http.get(`${BASE}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  if (TOKEN) {
    const nodes = http.get(`${BASE}/api/v1/nodes?limit=10`, { headers });
    check(nodes, { 'nodes 200': (r) => r.status === 200 });
  }

  sleep(1);
}
