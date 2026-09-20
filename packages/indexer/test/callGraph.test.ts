import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSource } from "../src/parse.js";
import { extractSymbols } from "../src/symbols.js";
import { extractCallEdges } from "../src/callGraph.js";
import type { CodeSymbol } from "../src/types.js";

const fixturesDir = join(__dirname, "fixtures");

function byName(symbols: CodeSymbol[]): Map<string, CodeSymbol[]> {
  const map = new Map<string, CodeSymbol[]>();
  for (const s of symbols) {
    const list = map.get(s.name) ?? [];
    list.push(s);
    map.set(s.name, list);
  }
  return map;
}

describe("extractCallEdges (JavaScript)", () => {
  const source = readFileSync(join(fixturesDir, "sample.js"), "utf8");
  const tree = parseSource(source, "javascript");
  const symbols = extractSymbols(tree, "sample.js", "javascript", source.split("\n"));
  const edges = extractCallEdges(tree, symbols, byName(symbols), "javascript");

  function id(name: string): string {
    return symbols.find((s) => s.name === name)!.id;
  }

  it("links add -> helper (identifier call)", () => {
    expect(edges).toContainEqual({ from: id("add"), to: id("helper") });
  });

  it("links Widget.render -> add (call inside a method)", () => {
    expect(edges).toContainEqual({ from: id("render"), to: id("add") });
  });

  it("links a function assigned via exports.x -> helper", () => {
    expect(edges).toContainEqual({ from: id("triple"), to: id("helper") });
  });
});

describe("extractCallEdges (Python)", () => {
  const source = readFileSync(join(fixturesDir, "sample.py"), "utf8");
  const tree = parseSource(source, "python");
  const symbols = extractSymbols(tree, "sample.py", "python", source.split("\n"));
  const edges = extractCallEdges(tree, symbols, byName(symbols), "python");

  function id(name: string): string {
    return symbols.find((s) => s.name === name)!.id;
  }

  it("links Widget.render -> add", () => {
    expect(edges).toContainEqual({ from: id("render"), to: id("add") });
  });

  it("links add -> helper", () => {
    expect(edges).toContainEqual({ from: id("add"), to: id("helper") });
  });
});
