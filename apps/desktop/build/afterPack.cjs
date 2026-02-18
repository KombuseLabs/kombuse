/**
 * electron-builder afterPack hook.
 * 1. Copies missing native module deps into app.asar.unpacked/node_modules
 *    (bun hoists them to monorepo root, so electron-builder misses them)
 * 2. Creates a symlink from package/node_modules to app.asar.unpacked/node_modules
 *    so the package bundle can find better-sqlite3.
 */
const { join } = require("path");
const { symlinkSync, existsSync, cpSync } = require("fs");

// Deps that better-sqlite3 needs at runtime but bun hoists out of reach
const REQUIRED_DEPS = ["bindings", "file-uri-to-path"];

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const resourcesPath = join(appOutDir, "Kombuse.app", "Contents", "Resources");
  const unpackedModules = join(resourcesPath, "app.asar.unpacked", "node_modules");
  const packageNodeModules = join(resourcesPath, "package", "node_modules");

  // Copy missing deps into unpacked node_modules
  if (existsSync(unpackedModules)) {
    for (const dep of REQUIRED_DEPS) {
      const target = join(unpackedModules, dep);
      if (existsSync(target)) continue;

      // Resolve from monorepo root
      const resolved = require.resolve(`${dep}/package.json`);
      const source = join(resolved, "..");
      cpSync(source, target, { recursive: true });
      console.log(`  • copied ${dep} into unpacked node_modules`);
    }
  }

  // Symlink so package bundle can find native modules
  if (existsSync(unpackedModules) && !existsSync(packageNodeModules)) {
    symlinkSync("../app.asar.unpacked/node_modules", packageNodeModules);
    console.log("  • created package/node_modules symlink");
  }
};
