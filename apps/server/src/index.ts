import * as Sentry from "@sentry/node";
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
  seedDemoData,
  onEventCreated,
  dbContext,
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
  pluginSourceRoutes,
  analyticsRoutes,
  projectInitRoutes,
} from "./routes";
import { websocketRoutes, broadcastEvent } from "./websocket";
import {
  processEventAndRunAgents,
  cleanupOrphanedSessions,
  stopAllActiveBackends,
} from "./services/agent-execution-service";
import { createResponseValidationHook } from "./schemas/response-validation.schema";
import { resolveProjectSlug } from "./hooks/resolve-project-slug";
import { createAppLogger, closeAppLogger, pruneOldLogs, setAppLoggerOnLog, setLogDir, setLogTarget } from "./logger";
import { readFileLoggingEnabled } from "@kombuse/services";
import { join } from "node:path";
import { homedir } from "node:os";

const serverLog = createAppLogger('Server');

// Re-export for desktop shell integration
export { setAutoUpdater, type AutoUpdaterInterface } from "./routes";
export { setShellAutoUpdater } from "./routes";

export interface ServerOptions {
  port: number;
  dbPath?: string;
  desktop?: boolean;
  isolated?: boolean;
}

/**
 * Create a configured Fastify server instance.
 * Initializes and seeds the database internally.
 */
export async function createServer({ port, dbPath, desktop, isolated }: ServerOptions) {
  const db = initializeDatabase(dbPath);
  seedDatabase(db);
  if (isolated) {
    seedDemoData(db);
  }
  // Primary server sets the global DB for non-request contexts (e.g. orphan timer).
  // Isolated server skips this so it never clobbers the primary server's global ref.
  if (!isolated) {
    setDatabase(db);
  }

  // Isolated servers have no agent sessions, so orphan cleanup is unnecessary.
  if (!isolated) {
    // Clean up orphaned sessions from previous runs.
    // Startup recovery should reconcile immediately because in-process backends
    // are gone after restart.
    const abortedCount = cleanupOrphanedSessions({
      source: 'startup_cleanup',
      reason: 'server_startup_recovery',
      minInactiveMs: 0,
    });
    if (abortedCount > 0) {
      serverLog.info(
        `Aborted ${abortedCount} orphaned session(s) from previous run`
      );
    }
  }

  // Periodically detect and abort orphaned sessions (running with no live backend).
  // Skipped for isolated servers which have no agent sessions.
  const orphanInterval = isolated ? undefined : setInterval(() => {
    const count = cleanupOrphanedSessions();
    if (count > 0) {
      serverLog.info(
        `Cleaned up ${count} orphaned session(s)`
      );
    }
  }, 60_000);

  // Point log directory to ~/.kombuse/logs/ and configure target from user setting
  setLogDir(join(homedir(), '.kombuse', 'logs'))
  if (!process.env.KOMBUSE_LOG_TARGET) {
    const fileLoggingEnabled = readFileLoggingEnabled()
    setLogTarget(fileLoggingEnabled ? 'file' : 'console')
  }

  pruneOldLogs();

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      release: process.env.SENTRY_RELEASE,
      integrations: [Sentry.captureConsoleIntegration({ levels: ['warn', 'error'] })],
      tracesSampleRate: 0.1,
    });

    setAppLoggerOnLog((level, component, message, data) => {
      Sentry.captureMessage(`[${component}] ${message}`, {
        level: level === 'error' ? 'error' : 'warning',
        extra: data,
      });
    });
  }

  const fastify = Fastify({
    logger: false,
  });

  Sentry.setupFastifyErrorHandler(fastify);

  fastify.addHook("preSerialization", createResponseValidationHook());
  fastify.addHook("preHandler", resolveProjectSlug);

  // Scope each request's async context to this server instance's database.
  // This allows multiple server instances (primary + isolated) to coexist in
  // the same process without clobbering the shared global DB reference.
  const localDb = db;
  fastify.addHook("onRequest", async (_request, _reply) => {
    dbContext.enterWith({ db: localDb });
  });

  // Host header validation — primary defense against DNS rebinding.
  // A malicious page at evil.com that rebinds DNS to 127.0.0.1 still sends
  // Host: evil.com, which this hook rejects before any route handler runs.
  const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
  fastify.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (!host) {
      return reply.code(403).send({ error: "Missing Host header" });
    }
    // Strip port to get just the hostname. IPv6 brackets are preserved.
    const hostname = host.startsWith("[")
      ? host.slice(0, host.indexOf("]") + 1)
      : (host.split(":")[0] ?? host);
    if (!ALLOWED_HOSTS.has(hostname)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  });

  // Enable CORS for web app
  // app:// is the Electron production origin (registered as privileged scheme)
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === "app://." ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
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

  // Connect event system to WebSocket broadcaster and agent trigger processing.
  // Isolated servers have no WebSocket hub or agent processing — skipping these
  // prevents duplicate listener accumulation in the module-level listeners array.
  const unsubBroadcast = isolated ? () => {} : onEventCreated(broadcastEvent);
  const unsubAgents = isolated
    ? () => {}
    : onEventCreated(async (event) => {
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
  fastify.register(pluginSourceRoutes, { prefix: "/api" });
  fastify.register(analyticsRoutes, { prefix: "/api" });
  fastify.register(projectInitRoutes, { prefix: "/api" });

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
    listen: () => fastify.listen({ port, host: "127.0.0.1" }),
    close: () => {
      clearInterval(orphanInterval);
      unsubBroadcast();
      unsubAgents();
      if (!isolated) {
        stopAllActiveBackends();
        closeAppLogger();
      }
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
  serverLog.info('Starting Kombuse server...', { portFile });
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
