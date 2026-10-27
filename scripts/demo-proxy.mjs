#!/usr/bin/env node
/**
 * Demo reverse proxy — combines API (:3000) and Web (:5173) behind a single
 * port so a single Cloudflare Quick Tunnel can expose both.
 *
 * Usage:
 *   node scripts/demo-proxy.mjs          (listens on :8080)
 *   PORT=9090 node scripts/demo-proxy.mjs
 *
 * Routes:
 *   /api/*  → http://localhost:3000
 *   /*      → http://localhost:5173
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';

function proxy(req, res, target) {
  const url = new URL(req.url, target);
  const opts = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.host },
  };

  const upstream = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Bad Gateway: ${err.message}`);
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/health')) {
    proxy(req, res, API);
  } else {
    proxy(req, res, WEB);
  }
});

server.listen(PORT, () => {
  console.log(`Demo proxy listening on http://localhost:${PORT}`);
  console.log(`  /api/*  → ${API}`);
  console.log(`  /*      → ${WEB}`);
  console.log('');
  console.log('Start tunnel: cloudflared tunnel --url http://localhost:' + PORT);
});
EOF
echo created