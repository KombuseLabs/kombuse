import { describe, it, expect } from "vitest";
import { isNewerVersion } from "../version-utils";

describe("isNewerVersion", () => {
  // Standard version comparisons
  it("returns true when latest has higher major version", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest has higher minor version", () => {
    expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest has higher patch version", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
  });

  // Pre-release version comparisons (acceptance criteria 2-6)
  it("returns false when both are the same pre-release", () => {
    expect(isNewerVersion("1.0.0-rc.1", "1.0.0-rc.1")).toBe(false);
  });

  it("returns true when latest is a newer pre-release", () => {
    expect(isNewerVersion("1.0.0-rc.2", "1.0.0-rc.1")).toBe(true);
  });

  it("returns true when latest is release and current is pre-release", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-rc.1")).toBe(true);
  });

  it("returns false when latest is pre-release and current is release", () => {
    expect(isNewerVersion("1.0.0-rc.1", "1.0.0")).toBe(false);
  });

  it("returns true when latest has higher base version with pre-release current", () => {
    expect(isNewerVersion("2.0.0-beta.1", "1.0.0")).toBe(true);
  });

  // Edge cases
  it("returns false for invalid latest version", () => {
    expect(isNewerVersion("not-a-version", "1.0.0")).toBe(false);
  });

  it("returns false for invalid current version", () => {
    expect(isNewerVersion("1.0.0", "not-a-version")).toBe(false);
  });

  it("handles alpha pre-release precedence", () => {
    expect(isNewerVersion("1.0.0-beta.1", "1.0.0-alpha.1")).toBe(true);
  });
});
