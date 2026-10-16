import { startServer } from './infrastructure/http/server.js';
import { log } from './shared/logger/index.js';

/**
 * API entry point.
 */
async function main() {
  try {
    const app = await startServer();
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