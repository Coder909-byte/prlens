// Plain JSON.stringify throws on a BigInt ("Do not know how to serialize a
// BigInt") - pino's own logger already handles it fine internally, but
// anything that goes through JSON.stringify directly (a future dashboard API
// response via Hono's c.json(), etc.) would crash the moment a GitHub ID
// (installationId, githubReviewId - both BigInt columns; see
// packages/db/prisma/schema.prisma) reaches it. Adding toJSON here is the
// standard fix: it makes every JSON.stringify call in the process safe,
// rendering a BigInt as its decimal string.
if (typeof (BigInt.prototype as { toJSON?: unknown }).toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value(this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}
