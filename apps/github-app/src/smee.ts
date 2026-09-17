import SmeeClient from "smee-client";
import { logger } from "@prlens/shared";

/** Forwards a smee.io channel to the local webhook route. Local dev only. */
export function startSmeeClient(source: string, targetPort: number): { close: () => void } {
  const smee = new SmeeClient({
    source,
    target: `http://localhost:${targetPort}/webhooks/github`,
    logger: {
      info: (...args: unknown[]) => logger.info({ source: "smee" }, String(args[0])),
      error: (...args: unknown[]) => logger.error({ source: "smee" }, String(args[0])),
    },
  });
  return smee.start();
}
