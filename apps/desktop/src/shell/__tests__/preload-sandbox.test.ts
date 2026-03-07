import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("preload sandbox safety", () => {
  const preloadPath = join(__dirname, "../../../../dist/shell/preload.cjs");

  it("compiled preload bundle must not contain Node built-in requires", () => {
    if (!existsSync(preloadPath)) {
      console.warn(
        "Skipping: preload bundle not built yet (run build:shell first)",
      );
      return;
    }
    const content = readFileSync(preloadPath, "utf-8");
    const matches = content.match(/require\("node:[^"]+"\)/g);
    expect(matches).toBeNull();
  });
});
