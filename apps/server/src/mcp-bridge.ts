/**
 * MCP stdio-to-HTTP bridge.
 *
 * Spawned by MCP clients (Claude Code / Claude Desktop) in stdio mode.
 * Reads the running server's port from ~/.kombuse/server-port, then relays
 * JSON-RPC messages between stdin/stdout and the HTTP /mcp endpoint.
 *
 * Pure JS — no native modules, no database access.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const portFile = join(homedir(), ".kombuse", "server-port");

let port: string;
try {
  port = readFileSync(portFile, "utf-8").trim();
} catch {
  process.stderr.write(
    `Kombuse server is not running (${portFile} not found). Start the server or desktop app first.\n`
  );
  process.exit(1);
}

const mcpUrl = `http://localhost:${port}/mcp`;

const transport = new StdioServerTransport();

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

transport.onmessage = async (message) => {
  try {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(message),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      // SSE response — extract JSON-RPC messages from data: lines
      const text = await res.text();
      for (const msg of parseSseMessages(text)) {
        await transport.send(msg as Parameters<typeof transport.send>[0]);
      }
    } else {
      // Plain JSON response
      const body = await res.json();
      if (Array.isArray(body)) {
        for (const msg of body) {
          await transport.send(msg);
        }
      } else {
        await transport.send(body);
      }
    }
  } catch (err) {
    process.stderr.write(
      `Bridge error: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
};

await transport.start();
