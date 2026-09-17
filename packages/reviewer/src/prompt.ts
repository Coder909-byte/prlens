import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, "..", "prompts");

export function loadPrompt(filename: string): string {
  return readFileSync(join(promptsDir, filename), "utf8");
}
