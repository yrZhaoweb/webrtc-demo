import { WebSocketServer, WebSocket } from "ws";
import { AvesServer } from "@yrzhao/aves-node";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ port: PORT });

// 创建 Aves 服务器实例
const avesServer = new AvesServer({ debug: true });

console.log(`WebSocket server started on port ${PORT}`);

// 全局错误处理
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  // 不要退出进程，让服务继续运行
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// 优雅关闭
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  wss.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT signal received: closing HTTP server");
  wss.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

wss.on("connection", (socket: WebSocket) => {
  console.log("✅ New client connected");

  // 将 WebSocket 连接传递给 AvesServer
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
