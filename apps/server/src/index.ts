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
  type DatabaseType,
} from "@kombuse/persistence";
import {
  registerTicketTools,
  registerDatabaseTools,
  registerApiTools,
  registerAgentTools,
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
  attachmentRoutes,
  permissionRoutes,
  databaseRoutes,
  syncRoutes,
  claudeCodeRoutes,
  profileSettingsRoutes,
  codexMcpRoutes,
} from "./routes";
import { websocketRoutes, broadcastEvent } from "./websocket";
import {
  processEventAndRunAgents,
  cleanupOrphanedSessions,
  stopAllActiveBackends,
} from "./services/agent-execution-service";
import { createResponseValidationHook } from "./schemas/response-validation";

// Re-export for desktop shell integration
export { setAutoUpdater, type AutoUpdaterInterface } from "./routes";

export interface ServerOptions {
  port: number;
  db: DatabaseType;
}

/**
 * Create a configured Fastify server instance.
 * The db instance is injected via dependency injection.
 */
export async function createServer({ port, db }: ServerOptions) {
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

  // Enable CORS for web app
  // Note: app:// protocol sends null origin (opaque origin)
  await fastify.register(cors, {
    origin: ["http://localhost:3333", "null"],
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
  fastify.register(attachmentRoutes, { prefix: "/api" });
  fastify.register(permissionRoutes, { prefix: "/api" });
  fastify.register(databaseRoutes, { prefix: "/api" });
  fastify.register(syncRoutes, { prefix: "/api" });
  fastify.register(claudeCodeRoutes, { prefix: "/api" });
  fastify.register(profileSettingsRoutes, { prefix: "/api" });
  fastify.register(codexMcpRoutes, { prefix: "/api" });

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
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");

  const portFile = join(homedir(), ".kombuse", "server-port");
  console.log(`===> [Server] Starting Kombuse server...`, { portFile });
  const db = initializeDatabase();
  seedDatabase(db);
  const server = await createServer({ port: 3331, db });
  try {
    const address = await server.listen();
    const port = new URL(address).port;
    writeFileSync(portFile, port);
  } catch (err) {
    server.instance.log.error(err);
    process.exit(1);
  }
}
