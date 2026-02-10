/**
 * MCP stdio-to-HTTP bridge.
 *
 * Spawned by MCP clients (Claude Code / Claude Desktop) in stdio mode.
 * Watches ~/.kombuse/server-port for changes, then relays JSON-RPC messages
 * between stdin/stdout and the HTTP /mcp endpoint.
 *
 * Pure JS — no native modules, no database access.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, watchFile } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// --- Port resolution ---

const portFile = join(homedir(), ".kombuse", "server-port");
let mcpUrl: string | null = null;

function readPort(): string | null {
  try {
    const content = readFileSync(portFile, "utf-8").trim();
    if (/^\d+$/.test(content) && Number(content) > 0 && Number(content) <= 65535) {
      return content;
    }
    return null;
  } catch {
    return null;
  }
}

function updateMcpUrl(): void {
  const newPort = readPort();
  if (newPort) {
    const newUrl = `http://localhost:${newPort}/mcp`;
    if (newUrl !== mcpUrl) {
      process.stderr.write(`Bridge: server port ${newPort}\n`);
      mcpUrl = newUrl;
    }
  }
  // If port file is missing/invalid, keep last known mcpUrl (handles transient deletes during restart)
}

updateMcpUrl();
if (!mcpUrl) {
  process.stderr.write(`Waiting for server (${portFile})...\n`);
}
watchFile(portFile, { interval: 1000 }, () => updateMcpUrl());

// --- SSE parsing ---

/**
 * Parse SSE response body into JSON-RPC messages.
 * The /mcp endpoint returns text/event-stream with "event: message\ndata: {...}\n\n" frames.
 */
function parseSseMessages(text: string): unknown[] {
  const messages: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        messages.push(JSON.parse(line.slice(6)));
      } catch {
        // skip malformed data lines
      }
    }
  }
  return messages;
}

// --- Relay ---

type Message = Parameters<StdioServerTransport["send"]>[0];

async function relay(url: string, message: unknown, transport: StdioServerTransport): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(message),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    for (const msg of parseSseMessages(text)) {
      await transport.send(msg as Message);
    }
  } else {
    const body = await res.json();
    if (Array.isArray(body)) {
      for (const msg of body) {
        await transport.send(msg);
      }
    } else {
      await transport.send(body);
    }
  }
}

// --- Transport ---

const transport = new StdioServerTransport();

transport.onmessage = async (message) => {
  if (!mcpUrl) {
    process.stderr.write("Bridge error: server not available yet\n");
    return;
  }

  try {
    await relay(mcpUrl, message, transport);
  } catch (err) {
    // Connection failed — re-read port file and retry once if port changed
    const prevUrl = mcpUrl;
    updateMcpUrl();
    if (mcpUrl && mcpUrl !== prevUrl) {
      try {
        await relay(mcpUrl, message, transport);
        return;
      } catch {
        // fall through to error log
      }
    }
    process.stderr.write(
      `Bridge error: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
};

await transport.start();
