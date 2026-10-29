/**
 * Proxy trust for `req.ip` resolution (B11 / topology T2, ADR-0043).
 *
 * The production deployment terminates TLS at a Caddy reverse proxy
 * (docs/analysis/production-topology-b11.md). Caddy runs with host networking
 * and reaches the published backend ports through 127.0.0.1, but Docker NAT
 * rewrites the connection's source: inside the API container the socket peer
 * is the bridge gateway (172.16.0.0/12), not loopback. The trusted set is
 * therefore loopback plus the RFC1918/ULA ranges.
 *
 * NOTE: Fastify feeds this string to proxy-addr, which only understands
 * literal IPs/CIDRs — the named ranges Express supports (`'loopback'`,
 * `'private'`) are NOT valid here (they throw `invalid IP address`).
 *
 * This cannot be spoofed from the internet: a non-local attacker cannot open
 * a TCP connection whose source address is private (return-path routing
 * fails), and in the T2 topology the API publishes on 127.0.0.1 only — the
 * only peers it can ever see are the Docker gateway and local processes.
 *
 * Why not just the socket IP: the anonymous rate-limit buckets — keyed by
 * `req.ip` in `RateLimitingMiddleware` — would collapse into a single shared
 * bucket for every visitor behind the proxy, and the audit trail would lose
 * the client address. With no proxy in front at all (plain dev, E2E) no
 * `X-Forwarded-*` header is present and behavior is unchanged.
 *
 * If the API ever moves behind an off-host proxy (e.g. an AWS ALB under
 * topology T1), this value must be narrowed to the proxy's real CIDR.
 */
export const TRUST_PROXY =
  '127.0.0.0/8,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7';
