import { WebSocketServer, WebSocket, type ServerOptions } from "ws";
import { pathToFileURL } from "url";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { AvesServer } from "@yrzhao/aves-node";

const DEFAULT_PORT = 8080;
const DEFAULT_ROOM_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_MESSAGE_SIZE = 256 * 1024;
const DEFAULT_RATE_LIMIT_MAX_TOKENS = 120;
const DEFAULT_RATE_LIMIT_REFILL_RATE = 30;

export function resolvePort(portValue: string | undefined = process.env.PORT): number {
  const parsed = Number.parseInt(portValue ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

function resolvePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

export function createDemoRequestHandler(
  avesServer: AvesServer,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    if (request.method === "OPTIONS") {
      writeJson(response, 204, null);
      return;
    }

    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    void (async () => {
      try {
        if (url.pathname === "/health") {
          writeJson(response, 200, await avesServer.getHealth());
          return;
        }

        if (url.pathname === "/metrics") {
          writeJson(response, 200, await avesServer.getMetrics());
          return;
        }

        if (url.pathname === "/rooms") {
          writeJson(response, 200, {
            rooms: await avesServer.getAllRooms(),
          });
          return;
        }

        writeJson(response, 200, {
          name: "webrtc-demo-server",
          status: "ok",
          endpoints: ["/health", "/metrics", "/rooms"],
        });
      } catch (error) {
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function registerProcessHandlers(
  close: () => Promise<void>,
  exit: (code: number) => void = process.exit,
): () => void {
  const uncaughtExceptionHandler = (error: Error) => {
    console.error("❌ Uncaught Exception:", error);
  };

  const unhandledRejectionHandler = (reason: unknown, promise: Promise<unknown>) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  };

  const createSignalHandler = (signal: "SIGTERM" | "SIGINT") => async () => {
    console.log(`${signal} signal received: closing demo server`);
    await close();
    console.log("Demo server closed");
    exit(0);
  };

  const sigtermHandler = createSignalHandler("SIGTERM");
  const sigintHandler = createSignalHandler("SIGINT");

  process.on("uncaughtException", uncaughtExceptionHandler);
  process.on("unhandledRejection", unhandledRejectionHandler);
  process.on("SIGTERM", sigtermHandler);
  process.on("SIGINT", sigintHandler);

  return () => {
    process.off("uncaughtException", uncaughtExceptionHandler);
    process.off("unhandledRejection", unhandledRejectionHandler);
    process.off("SIGTERM", sigtermHandler);
    process.off("SIGINT", sigintHandler);
  };
}

export function createDemoServer(
  portOrOptions: number | ServerOptions = resolvePort(),
): {
  avesServer: AvesServer;
  wss: WebSocketServer;
  httpServer?: ReturnType<typeof createServer>;
  close: () => Promise<void>;
  disposeHandlers: () => void;
} {
  const options =
    typeof portOrOptions === "number" ? { port: portOrOptions } : portOrOptions;
  const avesServer = new AvesServer({
    debug: true,
    roomTimeout: resolvePositiveInteger(
      process.env.ROOM_TIMEOUT_MS,
      DEFAULT_ROOM_TIMEOUT_MS,
    ),
    maxMessageSize: resolvePositiveInteger(
      process.env.MAX_MESSAGE_SIZE,
      DEFAULT_MAX_MESSAGE_SIZE,
    ),
    rateLimit: {
      maxTokens: resolvePositiveInteger(
        process.env.RATE_LIMIT_MAX_TOKENS,
        DEFAULT_RATE_LIMIT_MAX_TOKENS,
      ),
      refillRate: resolvePositiveInteger(
        process.env.RATE_LIMIT_REFILL_RATE,
        DEFAULT_RATE_LIMIT_REFILL_RATE,
      ),
    },
  });
  const requestHandler = createDemoRequestHandler(avesServer);
  const httpServer =
    "port" in options && typeof options.port === "number"
      ? createServer(requestHandler)
      : undefined;
  const wss = httpServer
    ? new WebSocketServer({ server: httpServer })
    : new WebSocketServer(options);

  const close = async () => {
    await avesServer.close();
    await closeWebSocketServer(wss);
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
  const disposeHandlers = registerProcessHandlers(close);

  if ("port" in options && typeof options.port === "number") {
    httpServer?.listen(options.port);
    console.log(`WebSocket server started on port ${options.port}`);
  } else {
    console.log("WebSocket server created without binding a port");
  }

  wss.on("connection", (socket: WebSocket) => {
    console.log("✅ New client connected");
    avesServer.handleConnection(socket);

    socket.on("close", () => {
      console.log("👋 Client disconnected");
    });

    socket.on("error", (error) => {
      console.error("❌ WebSocket error:", error);
    });
  });

  wss.on("error", (error) => {
    console.error("❌ WebSocket Server error:", error);
  });

  console.log("🚀 Server is ready to accept connections");

  return {
    avesServer,
    wss,
    httpServer,
    close,
    disposeHandlers,
  };
}

const isDirectExecution =
  typeof process !== "undefined" &&
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  createDemoServer(resolvePort());
}
