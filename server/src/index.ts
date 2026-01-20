import { WebSocketServer, WebSocket } from "ws";
import { AvesServer } from "@yrzhao/aves-node";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ port: PORT });

// 创建 Aves 服务器实例
const avesServer = new AvesServer();

console.log(`WebSocket server started on port ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
  console.log("New client connected");

  // 将 WebSocket 连接传递给 AvesServer
  avesServer.handleConnection(socket);

  socket.on("close", () => {
    console.log("Client disconnected");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});
