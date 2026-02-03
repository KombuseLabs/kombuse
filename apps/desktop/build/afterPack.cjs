/**
 * electron-builder afterPack hook.
 * Creates a symlink from package/node_modules to app.asar.unpacked/node_modules
 * so the package bundle can find better-sqlite3.
 */
const { join } = require("path");
const { symlinkSync, existsSync } = require("fs");

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const resourcesPath = join(appOutDir, "Kombuse.app", "Contents", "Resources");

  const unpackedModules = join(resourcesPath, "app.asar.unpacked", "node_modules");
  const packageNodeModules = join(resourcesPath, "package", "node_modules");

  if (existsSync(unpackedModules) && !existsSync(packageNodeModules)) {
    // Create relative symlink so it works regardless of install location
    symlinkSync("../app.asar.unpacked/node_modules", packageNodeModules);
    console.log("  • created package/node_modules symlink");
  }
};
