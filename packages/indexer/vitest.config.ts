import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .repos/ holds real checked-out repo clones (unlike evals/dataset's
    // --no-checkout clones, this package's checkoutAt populates the
    // working tree) - without this, vitest's default file discovery picks
    // up whatever *.test.*/*.spec.* files those real repos happen to
    // contain and tries to run them as this package's own tests.
    exclude: ["**/node_modules/**", "**/.repos/**", "**/.cache/**"],
  },
});
