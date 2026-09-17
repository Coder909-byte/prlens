import { Redis } from "ioredis";
import { config } from "./config.js";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the underlying ioredis
 * connection so its blocking commands (used by Worker) reconnect correctly
 * instead of erroring - see https://docs.bullmq.io/guide/going-to-production.
 */
export function createRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}
