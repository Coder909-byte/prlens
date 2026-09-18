import { describe, expect, it } from "vitest";
import { FindingsSchema } from "../src/schema.js";

describe("FindingsSchema", () => {
  it("accepts a well-formed findings object", () => {
    const result = FindingsSchema.safeParse({
      findings: [
        {
          file: "src/index.ts",
          line: 42,
          severity: "high",
          category: "bug",
          explanation: "Null check missing before dereference.",
          suggested_fix: "Add an early return if value is null.",
          confidence: 0.8,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty findings array", () => {
    expect(FindingsSchema.safeParse({ findings: [] }).success).toBe(true);
  });

  it("rejects an invalid severity", () => {
    const result = FindingsSchema.safeParse({
      findings: [
        {
          file: "a.ts",
          line: 1,
          severity: "extreme",
          category: "bug",
          explanation: "x",
          suggested_fix: "",
          confidence: 0.5,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence outside [0, 1]", () => {
    const result = FindingsSchema.safeParse({
      findings: [
        {
          file: "a.ts",
          line: 1,
          severity: "low",
          category: "style",
          explanation: "x",
          suggested_fix: "",
          confidence: 1.5,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("wraps a bare array response into {findings: [...]} (seen from Groq)", () => {
    const finding = {
      file: "src/index.ts",
      line: 42,
      severity: "high",
      category: "bug",
      explanation: "Null check missing before dereference.",
      suggested_fix: "",
      confidence: 0.8,
    };

    const result = FindingsSchema.safeParse([finding]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ findings: [finding] });
    }
  });

  it("wraps a bare empty array response into {findings: []}", () => {
    const result = FindingsSchema.safeParse([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ findings: [] });
    }
  });

  it("still rejects a bare array containing an invalid finding", () => {
    const result = FindingsSchema.safeParse([{ file: "a.ts", line: 1, severity: "extreme", category: "bug", explanation: "x", suggested_fix: "", confidence: 0.5 }]);
    expect(result.success).toBe(false);
  });
});
