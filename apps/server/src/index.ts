import Fastify from "fastify";
import cors from "@fastify/cors";
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
import { registerTicketTools } from "@kombuse/mcp";
import {
  ticketRoutes,
  profileRoutes,
  projectRoutes,
  labelRoutes,
  commentRoutes,
  eventRoutes,
} from "./routes";
import { websocketRoutes, broadcastEvent } from "./websocket";

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

  const fastify = Fastify({
    logger: true,
  });

  // Enable CORS for web app
  // Note: app:// protocol sends null origin (opaque origin)
  await fastify.register(cors, {
    origin: ["http://localhost:3333", "null"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  // WebSocket support for real-time updates
  await fastify.register(websocket);
  fastify.register(websocketRoutes);

  // Connect event system to WebSocket broadcaster
  onEventCreated(broadcastEvent);

  // API routes
  fastify.register(ticketRoutes, { prefix: "/api" });
  fastify.register(profileRoutes, { prefix: "/api" });
  fastify.register(projectRoutes, { prefix: "/api" });
  fastify.register(labelRoutes, { prefix: "/api" });
  fastify.register(commentRoutes, { prefix: "/api" });
  fastify.register(eventRoutes, { prefix: "/api" });

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
