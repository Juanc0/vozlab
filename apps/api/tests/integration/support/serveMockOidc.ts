import { startMockOidcProvider } from './mockOidc.js';

const port = Number(process.env.MOCK_OIDC_PORT ?? 8080);

startMockOidcProvider({ port })
  .then((provider) => {
    console.log(`Mock OIDC listening on ${provider.issuer}`);
    const shutdown = () => {
      void provider.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
