import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSource } from "../src/parse.js";
import { extractSymbols } from "../src/symbols.js";

const fixturesDir = join(__dirname, "fixtures");

describe("extractSymbols (JavaScript)", () => {
  const source = readFileSync(join(fixturesDir, "sample.js"), "utf8");
  const tree = parseSource(source, "javascript");
  const symbols = extractSymbols(tree, "sample.js", "javascript", source.split("\n"));

  it("finds function declarations", () => {
    expect(symbols.find((s) => s.name === "add" && s.kind === "function")).toBeDefined();
    expect(symbols.find((s) => s.name === "helper" && s.kind === "function")).toBeDefined();
  });

  it("finds a class declaration and its method", () => {
    expect(symbols.find((s) => s.name === "Widget" && s.kind === "class")).toBeDefined();
    expect(symbols.find((s) => s.name === "render" && s.kind === "method")).toBeDefined();
  });

  it("finds an arrow function assigned to a const", () => {
    expect(symbols.find((s) => s.name === "double" && s.kind === "function")).toBeDefined();
  });

  it("finds a function assigned to exports.x", () => {
    expect(symbols.find((s) => s.name === "triple" && s.kind === "function")).toBeDefined();
  });
});

describe("extractSymbols (Python)", () => {
  const source = readFileSync(join(fixturesDir, "sample.py"), "utf8");
  const tree = parseSource(source, "python");
  const symbols = extractSymbols(tree, "sample.py", "python", source.split("\n"));

  it("finds top-level functions", () => {
    expect(symbols.find((s) => s.name === "helper" && s.kind === "function")).toBeDefined();
    expect(symbols.find((s) => s.name === "add" && s.kind === "function")).toBeDefined();
  });

  it("classifies a method inside a class as kind method, not function", () => {
    const render = symbols.find((s) => s.name === "render");
    expect(render?.kind).toBe("method");
  });

  it("finds the class itself", () => {
    expect(symbols.find((s) => s.name === "Widget" && s.kind === "class")).toBeDefined();
  });
});
