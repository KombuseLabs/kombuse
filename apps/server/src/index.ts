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
  sessionsRepository,
  type DatabaseType,
} from "@kombuse/persistence";
import { registerTicketTools } from "@kombuse/mcp";
import {
  ticketRoutes,
  profileRoutes,
  projectRoutes,
  labelRoutes,
  commentRoutes,
  eventRoutes,
  agentRoutes,
  sessionRoutes,
  updateRoutes,
  attachmentRoutes,
  syncRoutes,
  debugRoutes,
  claudeCodeRoutes,
} from "./routes";
import { websocketRoutes, broadcastEvent } from "./websocket";
import { processEventAndRunAgents } from "./services/agent-execution-service";

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

  // Clean up orphaned sessions from any previous server run.
  // After a restart, no in-process backend can be alive, so all
  // 'running' sessions are stale and must be marked 'aborted'.
  const abortedCount = sessionsRepository.abortAllRunningSessions();
  if (abortedCount > 0) {
    console.log(
      `[Server] Aborted ${abortedCount} orphaned session(s) from previous run`
    );
  }

  const fastify = Fastify({
    logger: false,
  });

  // Enable CORS for web app
  // Note: app:// protocol sends null origin (opaque origin)
  await fastify.register(cors, {
    origin: ["http://localhost:3333", "null"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
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

  // API routes
  fastify.register(ticketRoutes, { prefix: "/api" });
  fastify.register(profileRoutes, { prefix: "/api" });
  fastify.register(projectRoutes, { prefix: "/api" });
  fastify.register(labelRoutes, { prefix: "/api" });
  fastify.register(commentRoutes, { prefix: "/api" });
  fastify.register(eventRoutes, { prefix: "/api" });
  fastify.register(agentRoutes, { prefix: "/api" });
  fastify.register(sessionRoutes, { prefix: "/api" });
  fastify.register(updateRoutes, { prefix: "/api" });
  fastify.register(attachmentRoutes, { prefix: "/api" });
  fastify.register(syncRoutes, { prefix: "/api" });
  fastify.register(debugRoutes, { prefix: "/api" });
  fastify.register(claudeCodeRoutes, { prefix: "/api" });

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
    await mcpServer.server.connect(transport);

    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.hijack();
  });

  return {
    listen: () => fastify.listen({ port, host: "0.0.0.0" }),
    close: () => fastify.close(),
    instance: fastify,
  };
}

// Entry point for direct execution
const isDirectExecution =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("tsx");

if (isDirectExecution) {
  const db = initializeDatabase();
  seedDatabase(db);
  const server = await createServer({ port: 3331, db });
  try {
    await server.listen();
  } catch (err) {
    server.instance.log.error(err);
    process.exit(1);
  }
}
