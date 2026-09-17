import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.privateKey",
      "*.private_key",
      "*.token",
      "*.apiKey",
      "*.api_key",
      "*.authorization",
      "*.headers.authorization",
      "*.secret",
      "*.webhookSecret",
    ],
    censor: "[REDACTED]",
  },
});
