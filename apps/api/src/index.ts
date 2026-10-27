import './infrastructure/observability/tracing.js';
import type { FastifyInstance } from 'fastify';
import { startServer } from './infrastructure/http/server.js';
import { log } from './shared/logger/index.js';

/**
 * API entry point.
 */

let app: FastifyInstance | undefined;

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      log.info({ signal }, 'shutting down');
      try {
        await app?.close();
        process.exit(0);
      } catch (err) {
        log.error(err, 'shutdown failed');
        process.exit(1);
      }
    })();
  });
}

async function main() {
  try {
    app = await startServer();
    log.info(
      { port: app.server.address() },
      '🚀 VozLab API server running'
    );
  } catch (err) {
    log.fatal(err, 'Failed to start VozLab API');
    process.exit(1);
  }
}

main();
