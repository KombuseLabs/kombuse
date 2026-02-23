import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  setDatabase,
  initializeDatabase,
  seedDatabase,
  onEventCreated,
} from "@kombuse/persistence";
import {
  registerTicketTools,
  registerDatabaseTools,
  registerApiTools,
  registerAgentTools,
  registerDesktopTools,
  type ApiRouteInfo,
} from "@kombuse/mcp";
import {
  ticketRoutes,
  profileRoutes,
  projectRoutes,
  labelRoutes,
  milestoneRoutes,
  commentRoutes,
  eventRoutes,
  agentRoutes,
  sessionRoutes,
  updateRoutes,
  shellUpdateRoutes,
  attachmentRoutes,
  permissionRoutes,
  databaseRoutes,
  syncRoutes,
  claudeCodeRoutes,
  profileSettingsRoutes,
  codexMcpRoutes,
  claudeCodeMcpRoutes,
  modelRoutes,
  backendStatusRoutes,
  pluginRoutes,
  analyticsRoutes,
} from "./routes";
import { websocketRoutes, broadcastEvent } from "./websocket";
import {
  processEventAndRunAgents,
  cleanupOrphanedSessions,
  stopAllActiveBackends,
} from "./services/agent-execution-service";
import { createResponseValidationHook } from "./schemas/response-validation";
import { resolveProjectSlug } from "./hooks/resolve-project-slug";

// Re-export for desktop shell integration
export { setAutoUpdater, type AutoUpdaterInterface } from "./routes";
export { setShellAutoUpdater } from "./routes";

export interface ServerOptions {
  port: number;
  dbPath?: string;
  desktop?: boolean;
}

/**
 * Create a configured Fastify server instance.
 * Initializes and seeds the database internally.
 */
export async function createServer({ port, dbPath, desktop }: ServerOptions) {
  const db = initializeDatabase(dbPath);
  seedDatabase(db);
  setDatabase(db);

  // Clean up orphaned sessions from previous runs.
  // Startup recovery should reconcile immediately because in-process backends
  // are gone after restart.
  const abortedCount = cleanupOrphanedSessions({
    source: 'startup_cleanup',
    reason: 'server_startup_recovery',
    minInactiveMs: 0,
  });
  if (abortedCount > 0) {
    console.log(
      `[Server] Aborted ${abortedCount} orphaned session(s) from previous run`
    );
  }

  // Periodically detect and abort orphaned sessions (running with no live backend)
  const orphanInterval = setInterval(() => {
    const count = cleanupOrphanedSessions();
    if (count > 0) {
      console.log(
        `[Server] Cleaned up ${count} orphaned session(s)`
      );
    }
  }, 60_000);

  const fastify = Fastify({
    logger: false,
  });

  fastify.addHook("preSerialization", createResponseValidationHook());
  fastify.addHook("preHandler", resolveProjectSlug);

  // Enable CORS for web app
  // app:// is the Electron production origin (registered as privileged scheme)
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow Electron app, localhost, and LAN access for mobile dev
      if (
        !origin ||
        origin === "app://." ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://192.168.")
      ) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Multipart file uploads (10 MB limit)
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  });

  // WebSocket support for real-time updates
  await fastify.register(websocket);
  fastify.register(websocketRoutes);

  // Connect event system to WebSocket broadcaster
  onEventCreated(broadcastEvent);

  // Connect event system to agent trigger processing
  onEventCreated(async (event) => {
    await processEventAndRunAgents(event);
  });

  // Collect API route metadata for MCP discovery tool
  const apiRoutes: ApiRouteInfo[] = [];
  fastify.addHook("onRoute", (routeOptions) => {
    if (!routeOptions.path.startsWith("/api/")) return;
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    for (const method of methods) {
      apiRoutes.push({ method, path: routeOptions.path });
    }
  });

  // API routes
  fastify.register(ticketRoutes, { prefix: "/api" });
  fastify.register(profileRoutes, { prefix: "/api" });
  fastify.register(projectRoutes, { prefix: "/api" });
  fastify.register(labelRoutes, { prefix: "/api" });
  fastify.register(milestoneRoutes, { prefix: "/api" });
  fastify.register(commentRoutes, { prefix: "/api" });
  fastify.register(eventRoutes, { prefix: "/api" });
  fastify.register(agentRoutes, { prefix: "/api" });
  fastify.register(sessionRoutes, { prefix: "/api" });
  fastify.register(updateRoutes, { prefix: "/api" });
  fastify.register(shellUpdateRoutes, { prefix: "/api" });
  fastify.register(attachmentRoutes, { prefix: "/api" });
  fastify.register(permissionRoutes, { prefix: "/api" });
  fastify.register(databaseRoutes, { prefix: "/api" });
  fastify.register(syncRoutes, { prefix: "/api" });
  fastify.register(claudeCodeRoutes, { prefix: "/api" });
  fastify.register(profileSettingsRoutes, { prefix: "/api" });
  fastify.register(codexMcpRoutes, { prefix: "/api" });
  fastify.register(claudeCodeMcpRoutes, { prefix: "/api" });
  fastify.register(modelRoutes, { prefix: "/api" });
  fastify.register(backendStatusRoutes, { prefix: "/api" });
  fastify.register(pluginRoutes, { prefix: "/api" });
  fastify.register(analyticsRoutes, { prefix: "/api" });

  fastify.get("/", async () => {
    return { hello: "world" };
  });

  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  // MCP endpoint - handles both POST (JSON-RPC) and GET (SSE streams)
  fastify.all("/mcp", async (request, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    const mcpServer = new McpServer({ name: "kombuse", version: "0.1.0" });
    registerTicketTools(mcpServer);
    registerDatabaseTools(mcpServer);
    registerApiTools(mcpServer, fastify, apiRoutes);
    registerAgentTools(mcpServer);
    if (desktop) registerDesktopTools(mcpServer, fastify);
    await mcpServer.server.connect(transport);

    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.hijack();
  });

  return {
    listen: () => fastify.listen({ port, host: "0.0.0.0" }),
    close: () => {
      clearInterval(orphanInterval);
      stopAllActiveBackends();
      return fastify.close();
    },
    instance: fastify,
  };
}

// Entry point for direct execution
const isDirectExecution =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("tsx");

if (isDirectExecution) {
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");

  const portFile = join(homedir(), ".kombuse", "server-port");
  console.log(`===> [Server] Starting Kombuse server...`, { portFile });
  const server = await createServer({ port: 3331 });
  try {
    const address = await server.listen();
    const port = new URL(address).port;
    writeFileSync(portFile, port);

    const cleanup = () => {
      try { unlinkSync(portFile); } catch { /* already removed */ }
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } catch (err) {
    server.instance.log.error(err);
    process.exit(1);
  }
}
