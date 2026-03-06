import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockExistsSync,
  mockMkdirSync,
  mockCpSync,
  mockReaddirSync,
  mockSymlinkSync,
  mockUnlinkSync,
  mockLstatSync,
  mockReadlinkSync,
  mockGetPackageManifest,
  mockGetPackageVersionPath,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockMkdirSync: vi.fn(),
  mockCpSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockSymlinkSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockLstatSync: vi.fn(),
  mockReadlinkSync: vi.fn(),
  mockGetPackageManifest: vi.fn(),
  mockGetPackageVersionPath: vi.fn((v: string) => `/mock/.kombuse/packages/v${v}`),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  cpSync: mockCpSync,
  readdirSync: mockReaddirSync,
  symlinkSync: mockSymlinkSync,
  unlinkSync: mockUnlinkSync,
  lstatSync: mockLstatSync,
  readlinkSync: mockReadlinkSync,
}));

vi.mock("../../paths", () => ({
  getKombuseDir: () => "/mock/.kombuse",
  getPackagesDir: () => "/mock/.kombuse/packages",
  getCurrentPackagePath: () => "/mock/.kombuse/packages/current",
  getPackageVersionPath: mockGetPackageVersionPath,
}));

vi.mock("../package-loader", () => ({
  getPackageManifest: mockGetPackageManifest,
}));

import {
  ensurePackagesDir,
  installPackage,
  updateCurrentSymlink,
  listPackages,
  rollbackPackage,
  hasInstalledPackage,
  getCurrentSymlinkPath,
} from "../updater";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockManifest(version = "1.0.0") {
  return {
    version,
    minShellVersion: "0.1.0",
    buildTime: "2026-01-01T00:00:00Z",
    files: { server: "server.js", web: "web/" },
  };
}

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "/mock/.kombuse/packages",
    path: "/mock/.kombuse/packages",
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockExistsSync.mockReset();
  mockMkdirSync.mockReset();
  mockCpSync.mockReset();
  mockReaddirSync.mockReset();
  mockSymlinkSync.mockReset();
  mockUnlinkSync.mockReset();
  mockLstatSync.mockReset();
  mockReadlinkSync.mockReset();
  mockGetPackageManifest.mockReset();
  mockGetPackageVersionPath.mockReset();
  mockGetPackageVersionPath.mockImplementation((v: string) => `/mock/.kombuse/packages/v${v}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updater", () => {
  // -------------------------------------------------------------------------
  // getCurrentSymlinkPath
  // -------------------------------------------------------------------------
  describe("getCurrentSymlinkPath", () => {
    it("returns the current package path", () => {
      expect(getCurrentSymlinkPath()).toBe("/mock/.kombuse/packages/current");
    });
  });

  // -------------------------------------------------------------------------
  // ensurePackagesDir
  // -------------------------------------------------------------------------
  describe("ensurePackagesDir", () => {
    it("creates dir with { recursive: true } when it does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      ensurePackagesDir();

      expect(mockMkdirSync).toHaveBeenCalledWith("/mock/.kombuse/packages", { recursive: true });
    });

    it("does not create dir when it already exists", () => {
      mockExistsSync.mockReturnValue(true);

      ensurePackagesDir();

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // installPackage
  // -------------------------------------------------------------------------
  describe("installPackage", () => {
    it("reads manifest, copies to versioned path, updates symlink, and returns version", () => {
      mockGetPackageManifest.mockReturnValue(mockManifest("2.0.0"));
      // ensurePackagesDir: existsSync for packages dir
      // updateCurrentSymlink: existsSync for target path, lstatSync throws (no existing symlink)
      mockExistsSync
        .mockReturnValueOnce(true) // ensurePackagesDir — dir exists
        .mockReturnValueOnce(false) // cpSync branch — dest does not exist
        .mockReturnValueOnce(true); // updateCurrentSymlink — target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const version = installPackage("/tmp/new-package");

      expect(version).toBe("2.0.0");
      expect(mockGetPackageManifest).toHaveBeenCalledWith("/tmp/new-package");
      expect(mockCpSync).toHaveBeenCalledWith(
        "/tmp/new-package",
        "/mock/.kombuse/packages/v2.0.0",
        { recursive: true },
      );
      expect(mockSymlinkSync).toHaveBeenCalledWith(
        "/mock/.kombuse/packages/v2.0.0",
        "/mock/.kombuse/packages/current",
      );
    });

    it("overwrites existing version with force: true", () => {
      mockGetPackageManifest.mockReturnValue(mockManifest("1.0.0"));
      mockExistsSync
        .mockReturnValueOnce(true) // ensurePackagesDir
        .mockReturnValueOnce(true) // dest exists → overwrite branch
        .mockReturnValueOnce(true); // updateCurrentSymlink target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      installPackage("/tmp/existing-package");

      expect(mockCpSync).toHaveBeenCalledWith(
        "/tmp/existing-package",
        "/mock/.kombuse/packages/v1.0.0",
        { recursive: true, force: true },
      );
    });

    it("copies without force when destination does not exist", () => {
      mockGetPackageManifest.mockReturnValue(mockManifest("3.0.0"));
      mockExistsSync
        .mockReturnValueOnce(true) // ensurePackagesDir
        .mockReturnValueOnce(false) // dest does not exist
        .mockReturnValueOnce(true); // updateCurrentSymlink target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      installPackage("/tmp/new-package");

      expect(mockCpSync).toHaveBeenCalledWith(
        "/tmp/new-package",
        "/mock/.kombuse/packages/v3.0.0",
        { recursive: true },
      );
    });

    it("calls ensurePackagesDir before copying", () => {
      mockGetPackageManifest.mockReturnValue(mockManifest("1.0.0"));
      // packages dir does not exist → mkdirSync should be called
      mockExistsSync
        .mockReturnValueOnce(false) // ensurePackagesDir — dir missing
        .mockReturnValueOnce(false) // dest does not exist
        .mockReturnValueOnce(true); // updateCurrentSymlink target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      installPackage("/tmp/package");

      expect(mockMkdirSync).toHaveBeenCalledWith("/mock/.kombuse/packages", { recursive: true });
      // mkdirSync is called before cpSync
      const mkdirOrder = mockMkdirSync.mock.invocationCallOrder[0]!;
      const cpOrder = mockCpSync.mock.invocationCallOrder[0]!;
      expect(mkdirOrder).toBeLessThan(cpOrder);
    });
  });

  // -------------------------------------------------------------------------
  // updateCurrentSymlink
  // -------------------------------------------------------------------------
  describe("updateCurrentSymlink", () => {
    it("creates symlink pointing at the versioned directory", () => {
      mockExistsSync.mockReturnValueOnce(true); // target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      updateCurrentSymlink("1.0.0");

      expect(mockSymlinkSync).toHaveBeenCalledWith(
        "/mock/.kombuse/packages/v1.0.0",
        "/mock/.kombuse/packages/current",
      );
    });

    it("removes existing symlink before creating new one", () => {
      mockExistsSync.mockReturnValueOnce(true); // target exists
      mockLstatSync.mockReturnValue({
        isSymbolicLink: () => true,
        isFile: () => false,
        isDirectory: () => false,
      });

      updateCurrentSymlink("2.0.0");

      expect(mockUnlinkSync).toHaveBeenCalledWith("/mock/.kombuse/packages/current");
      expect(mockSymlinkSync).toHaveBeenCalledWith(
        "/mock/.kombuse/packages/v2.0.0",
        "/mock/.kombuse/packages/current",
      );
      // unlinkSync before symlinkSync
      const unlinkOrder = mockUnlinkSync.mock.invocationCallOrder[0]!;
      const symlinkOrder = mockSymlinkSync.mock.invocationCallOrder[0]!;
      expect(unlinkOrder).toBeLessThan(symlinkOrder);
    });

    it("skips removal when lstatSync throws (no existing symlink)", () => {
      mockExistsSync.mockReturnValueOnce(true); // target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      updateCurrentSymlink("1.0.0");

      expect(mockUnlinkSync).not.toHaveBeenCalled();
      expect(mockSymlinkSync).toHaveBeenCalledOnce();
    });

    it('throws "Package version not found" when target path does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false); // target does not exist

      expect(() => updateCurrentSymlink("9.9.9")).toThrow("Package version not found: v9.9.9");
    });
  });

  // -------------------------------------------------------------------------
  // listPackages
  // -------------------------------------------------------------------------
  describe("listPackages", () => {
    it("returns [] when packages dir does not exist", () => {
      mockExistsSync.mockReturnValueOnce(false); // packages dir missing

      expect(listPackages()).toEqual([]);
    });

    it("returns [] when dir is empty", () => {
      mockExistsSync
        .mockReturnValueOnce(true) // packages dir exists
        .mockReturnValueOnce(false); // current symlink does not exist
      mockReaddirSync.mockReturnValue([]);

      expect(listPackages()).toEqual([]);
    });

    it("skips non-directory entries", () => {
      mockExistsSync
        .mockReturnValueOnce(true) // packages dir exists
        .mockReturnValueOnce(false); // current symlink does not exist
      mockReaddirSync.mockReturnValue([makeDirent("v1.0.0", false)]);

      expect(listPackages()).toEqual([]);
      expect(mockGetPackageManifest).not.toHaveBeenCalled();
    });

    it('skips entries not starting with "v"', () => {
      mockExistsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockReaddirSync.mockReturnValue([
        makeDirent("current", true),
        makeDirent("temp", true),
      ]);

      expect(listPackages()).toEqual([]);
      expect(mockGetPackageManifest).not.toHaveBeenCalled();
    });

    it("skips directories where getPackageManifest throws", () => {
      mockExistsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockReaddirSync.mockReturnValue([makeDirent("v1.0.0", true)]);
      mockGetPackageManifest.mockImplementation(() => {
        throw new Error("manifest.json not found");
      });

      expect(listPackages()).toEqual([]);
    });

    it("identifies isCurrent via symlink target regex including pre-release", () => {
      mockExistsSync
        .mockReturnValueOnce(true) // packages dir exists
        .mockReturnValueOnce(true); // current symlink exists
      mockReadlinkSync.mockReturnValue("/mock/.kombuse/packages/v1.0.0-rc.1");
      mockReaddirSync.mockReturnValue([
        makeDirent("v1.0.0-rc.1", true),
        makeDirent("v0.9.0", true),
      ]);
      const manifest1 = mockManifest("1.0.0-rc.1");
      const manifest2 = mockManifest("0.9.0");
      mockGetPackageManifest
        .mockReturnValueOnce(manifest1)
        .mockReturnValueOnce(manifest2);

      const result = listPackages();

      expect(result).toHaveLength(2);
      const current = result.find((p) => p.version === "1.0.0-rc.1");
      const other = result.find((p) => p.version === "0.9.0");
      expect(current?.isCurrent).toBe(true);
      expect(other?.isCurrent).toBe(false);
    });

    it("sorts versions descending with numeric comparison", () => {
      mockExistsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockReaddirSync.mockReturnValue([
        makeDirent("v1.0.0", true),
        makeDirent("v10.0.0", true),
        makeDirent("v2.0.0", true),
      ]);
      mockGetPackageManifest
        .mockReturnValueOnce(mockManifest("1.0.0"))
        .mockReturnValueOnce(mockManifest("10.0.0"))
        .mockReturnValueOnce(mockManifest("2.0.0"));

      const result = listPackages();

      expect(result.map((p) => p.version)).toEqual(["10.0.0", "2.0.0", "1.0.0"]);
    });
  });

  // -------------------------------------------------------------------------
  // rollbackPackage
  // -------------------------------------------------------------------------
  describe("rollbackPackage", () => {
    it("updates symlink to given version", () => {
      // rollbackPackage calls existsSync for its own check, then updateCurrentSymlink checks again
      mockExistsSync
        .mockReturnValueOnce(true) // rollbackPackage — target exists
        .mockReturnValueOnce(true); // updateCurrentSymlink — target exists
      mockLstatSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      rollbackPackage("1.0.0");

      expect(mockSymlinkSync).toHaveBeenCalledWith(
        "/mock/.kombuse/packages/v1.0.0",
        "/mock/.kombuse/packages/current",
      );
    });

    it('throws "Package version not found" when version dir does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(() => rollbackPackage("9.9.9")).toThrow("Package version not found: v9.9.9");
    });
  });

  // -------------------------------------------------------------------------
  // hasInstalledPackage
  // -------------------------------------------------------------------------
  describe("hasInstalledPackage", () => {
    it("returns true when symlink exists", () => {
      mockExistsSync.mockReturnValueOnce(true);

      expect(hasInstalledPackage()).toBe(true);
    });

    it("returns false when symlink does not exist", () => {
      mockExistsSync.mockReturnValueOnce(false);

      expect(hasInstalledPackage()).toBe(false);
    });
  });
});
