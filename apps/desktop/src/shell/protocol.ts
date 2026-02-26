import { protocol } from "electron";
import { lookup } from "mime-types";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

let webRoot: string;

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Register the app:// protocol to serve web assets.
 * Must be called after app.whenReady().
 *
 * @param root - The root directory containing the web assets (e.g., apps/web/dist)
 */
export function registerAppProtocol(root: string): void {
  webRoot = root;

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    // Remove leading slash for file path resolution
    if (pathname.startsWith("/")) {
      pathname = pathname.slice(1);
    }

    // Default to index.html for root
    if (pathname === "" || pathname === ".") {
      pathname = "index.html";
    }

    const filePath = join(webRoot, pathname);

    // Check if file exists
    if (existsSync(filePath)) {
      return serveFile(filePath);
    }

    // SPA fallback: only for navigation routes (no file extension), not static assets
    const ext = extname(pathname);
    if (!ext || ext === ".html") {
      const indexPath = join(webRoot, "index.html");
      if (existsSync(indexPath)) {
        return serveFile(indexPath);
      }
    }

    // File not found
    return new Response("Not Found", { status: 404 });
  });
}

/**
 * Serve a file with the correct MIME type.
 */
function serveFile(filePath: string): Response {
  const ext = extname(filePath);
  const mimeType = lookup(ext) || "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Security-Policy": CSP_POLICY,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
