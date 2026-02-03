import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  setDatabase,
  initializeDatabase,
  type DatabaseType,
} from "@kombuse/persistence";
import { ticketRoutes } from "./routes";

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
  await fastify.register(cors, {
    origin: ["http://localhost:3333"],
  });

  // API routes
  fastify.register(ticketRoutes, { prefix: "/api" });

  fastify.get("/", async () => {
    return { hello: "world" };
  });

  fastify.get("/health", async () => {
    return { status: "ok" };
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
  const server = await createServer({ port: 3332, db });
  try {
    await server.listen();
  } catch (err) {
    server.instance.log.error(err);
    process.exit(1);
  }
}
