import { MongoMemoryServer } from 'mongodb-memory-server';

/** Env vars the harness owns, restored on stop(). */
const MANAGED_KEYS = ['NODE_ENV', 'PORT', 'MONGODB_URI'] as const;

/**
 * Spins up a real MongoDB in-process for e2e suites.
 *
 * Each suite gets its own server on its own port, so suites stay
 * isolated and can run in parallel — which matters because parallel dev
 * agents run these concurrently.
 *
 * The URI is written to `process.env` rather than passed via
 * ConfigModule's `load:`, because `validationSchema` validates
 * `process.env` *before* load factories run — so a value supplied that
 * way never reaches validation and boot fails on a "required" var.
 */
export class MongoTestHarness {
  private server?: MongoMemoryServer;
  private saved = new Map<string, string | undefined>();

  /** Start the server, point the app's env at it, return the URI. */
  async start(): Promise<string> {
    this.server = await MongoMemoryServer.create();
    const uri = this.server.getUri();

    for (const key of MANAGED_KEYS) {
      this.saved.set(key, process.env[key]);
    }

    // Tests must never reach a real database, whatever the developer's
    // local .env happens to contain.
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.MONGODB_URI = uri;

    return uri;
  }

  async stop(): Promise<void> {
    for (const [key, value] of this.saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.saved.clear();

    await this.server?.stop();
    this.server = undefined;
  }
}
