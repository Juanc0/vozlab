import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: 'vozlab_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestTotal = new Counter({
  name: 'vozlab_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export function registerMetricsRoute(app: FastifyInstance): void {
  app.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}

export function recordRequestMetrics(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
): void {
  const labels = { method, route, status_code: String(statusCode) };
  httpRequestDuration.observe(labels, durationSeconds);
  httpRequestTotal.inc(labels);
}