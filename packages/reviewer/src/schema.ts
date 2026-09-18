import { z } from "zod";

export const FindingSeverity = ["critical", "high", "medium", "low"] as const;
export const FindingCategory = ["bug", "security", "missing_test", "style"] as const;

export const FindingSchema = z.object({
  file: z.string().min(1).describe("Path of the changed file this finding is about, exactly as it appears in the diff."),
  line: z
    .number()
    .int()
    .positive()
    .describe("Line number in the NEW version of the file (right-hand side of the diff)."),
  severity: z.enum(FindingSeverity),
  category: z.enum(FindingCategory),
  explanation: z.string().min(1).describe("Why this is a problem, specific to this code."),
  suggested_fix: z.string().describe("A concrete suggested fix. Empty string if none applies."),
  confidence: z.number().min(0).max(1),
});

export type Finding = z.infer<typeof FindingSchema>;

/**
 * Some models (seen from Groq) return a bare `[...]` array instead of the
 * requested `{findings: [...]}` object - this normalizes that shape before
 * the rest of the schema validates, so it's accepted instead of failing.
 */
export const FindingsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { findings: value } : value),
  z.object({
    findings: z.array(FindingSchema),
  }),
);

export type Findings = z.infer<typeof FindingsSchema>;
