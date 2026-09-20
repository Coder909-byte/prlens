import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkoutAt, listTrackedFiles, REPOS_DIR } from "./clone.js";
import { languageForFile, parseSource } from "./parse.js";
import { extractSymbols } from "./symbols.js";
import { extractCallEdges } from "./callGraph.js";
import { readIndexCache, writeIndexCache } from "./cache.js";
import type { CodeSymbol, RepoIndex } from "./types.js";

const EXCLUDED_PATH = /(^|\/)(node_modules|vendor|dist|build|\.git|__pycache__)\//;
const MAX_FILE_BYTES = 500_000; // skip pathologically large generated/bundled files - not useful symbol material anyway
const TEST_PATH = /(^|\/)(tests?|specs?|__tests__)\/|(^|\/)[^/]*\.(spec|test)\.[jt]sx?$|(^|\/)test_[^/]*\.py$|(^|\/)conftest\.py$/i;

/**
 * Builds (or loads, on a cache hit) the symbol table + call graph for
 * `owner/name` at `sha`. Symbol-based only - no embeddings, per CLAUDE.md's
 * M3 scope. Cached per (repo, sha) so re-running the eval over the same
 * pairs never re-parses.
 */
export async function ensureIndex(owner: string, name: string, sha: string): Promise<RepoIndex> {
  const cached = readIndexCache(owner, name, sha);
  if (cached) return cached;

  const repoDir = await checkoutAt(owner, name, sha);
  const files = (await listTrackedFiles(repoDir)).filter((f) => !EXCLUDED_PATH.test(f) && languageForFile(f) !== null);

  const allSymbols: CodeSymbol[] = [];
  const testFiles: Record<string, string> = {};
  const fileData: { file: string; tree: ReturnType<typeof parseSource>; symbols: CodeSymbol[] }[] = [];

  for (const file of files) {
    const language = languageForFile(file)!;
    let source: string;
    try {
      source = readFileSync(join(repoDir, file), "utf8");
    } catch {
      continue; // e.g. a symlink or a file git ls-tree lists but that isn't readable as text
    }
    if (Buffer.byteLength(source, "utf8") > MAX_FILE_BYTES) continue;

    if (TEST_PATH.test(file)) testFiles[file] = source;

    const tree = parseSource(source, language);
    const symbols = extractSymbols(tree, file, language, source.split("\n"));
    allSymbols.push(...symbols);
    fileData.push({ file, tree, symbols });
  }

  const byName = new Map<string, CodeSymbol[]>();
  for (const s of allSymbols) {
    const list = byName.get(s.name) ?? [];
    list.push(s);
    byName.set(s.name, list);
  }

  const calls = fileData.flatMap(({ file, tree, symbols }) => extractCallEdges(tree, symbols, byName, languageForFile(file)!));

  const index: RepoIndex = { repo: `${owner}/${name}`, sha, symbols: allSymbols, calls, testFiles };
  writeIndexCache(owner, name, sha, index);
  return index;
}

export { REPOS_DIR };
