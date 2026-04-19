import { WebSocketServer, WebSocket, type ServerOptions } from "ws";
import { pathToFileURL } from "url";
import { AvesServer } from "@yrzhao/aves-node";

const DEFAULT_PORT = 8080;

export function resolvePort(portValue: string | undefined = process.env.PORT): number {
  const parsed = Number.parseInt(portValue ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

function closeServer(wss: WebSocketServer): Promise<void> {
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
  wss: WebSocketServer,
  exit: (code: number) => void = process.exit,
): () => void {
  const uncaughtExceptionHandler = (error: Error) => {
    console.error("❌ Uncaught Exception:", error);
  };

  const unhandledRejectionHandler = (reason: unknown, promise: Promise<unknown>) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  };

  const createSignalHandler = (signal: "SIGTERM" | "SIGINT") => async () => {
    console.log(`${signal} signal received: closing HTTP server`);
    await closeServer(wss);
    console.log("HTTP server closed");
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
  close: () => Promise<void>;
  disposeHandlers: () => void;
} {
  const options =
    typeof portOrOptions === "number" ? { port: portOrOptions } : portOrOptions;
  const wss = new WebSocketServer(options);
  const avesServer = new AvesServer({ debug: true });
  const disposeHandlers = registerProcessHandlers(wss);

  if ("port" in options && typeof options.port === "number") {
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
    close: () => closeServer(wss),
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
