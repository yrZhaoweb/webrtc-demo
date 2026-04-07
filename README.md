# WebRTC Demo - 测试 aves-core 和 aves-node

这是一个完整的 WebRTC 聊天室演示应用，用于验证 `aves-core` 和 `aves-node` 库的功能。

## ✨ 功能特性

- ✅ **实时聊天**: 基于 WebRTC DataChannel 的点对点消息传输
- ✅ **房间管理**: 创建和加入聊天室
- ✅ **多用户支持**: Mesh 网络架构，支持多人同时在线
- ✅ **连接状态可视化**: 实时显示信令和 WebRTC 连接状态
- ✅ **自动重连**: 网络中断后自动尝试重新连接
- ✅ **用户列表**: 实时显示在线用户
- ✅ **邀请链接**: 一键复制房间邀请链接
- ✅ **系统消息**: 用户加入/离开通知
- ✅ **错误处理**: 完善的错误提示和处理机制

## 🏗️ 项目结构

```
webrtc-demo/
├── server/          # 信令服务器 (使用 aves-node)
│   ├── src/
│   │   └── index.ts
│   └── package.json
├── web/             # Web 客户端 (使用 aves-core)
│   ├── src/
│   │   ├── components/
│   │   │   └── ConnectionStatus.svelte  # 连接状态组件
│   │   ├── routes/
│   │   │   ├── Home.svelte
│   │   │   └── Room.svelte
│   │   ├── services/
│   │   │   └── avesService.ts           # aves-core 封装
│   │   ├── lib/
│   │   │   ├── chat.ts
│   │   │   ├── stores/
│   │   │   └── types.ts
│   │   └── utils/
│   └── package.json
├── TESTING_GUIDE.md    # 详细测试指南
├── test-setup.sh       # 快速设置脚本
├── test-run.sh         # 快速运行脚本
└── test-stop.sh        # 停止服务脚本
```

## 🚀 快速开始

### 方法 1: 使用自动化脚本（推荐）

```bash
# 1. 设置环境（首次运行）
cd webrtc-demo
chmod +x test-*.sh
./test-setup.sh

# 2. 启动所有服务
./test-run.sh

# 3. 停止所有服务
./test-stop.sh
```

### 方法 2: 手动启动

#### 步骤 1: 构建依赖包

```bash
# 构建 aves-core
cd aves-core
npm install
npm run build

# 构建 aves-node
cd ../aves-node
npm install
npm run build
```

#### 步骤 2: 启动服务器

```bash
cd webrtc-demo/server
npm install
npm run dev
```

服务器将在 `ws://localhost:8080` 启动

#### 步骤 3: 启动 Web 客户端

在新的终端窗口：

```bash
cd webrtc-demo/web
npm install
npm run dev
```

访问显示的 URL（通常是 `http://localhost:5173`）

## 🧪 测试

### 基本测试

1. 打开两个浏览器窗口
2. 在第一个窗口创建房间
3. 复制邀请链接到第二个窗口
4. 开始聊天！

### 完整测试

参考 [TESTING_GUIDE.md](./TESTING_GUIDE.md) 进行全面测试，包括：

- ✅ 基本双人聊天
- ✅ 三人聊天室（Mesh 网络）
- ✅ 用户离开和重新加入
- ✅ 网络中断和重连
- ✅ 大量消息传输
- ✅ 并发房间
- ✅ 浏览器兼容性

## 📊 连接状态可视化

点击右上角的连接状态按钮，可以查看：

- **信令服务器状态**: 连接/断开/重连中
- **对等连接状态**: 每个用户的 WebRTC 连接状态
- **数据通道状态**: DataChannel 的打开/关闭状态

状态颜色说明：

- 🟢 绿色: 已连接/正常
- 🔵 蓝色: 连接中/新建
- 🟠 橙色: 重连中/警告
- 🔴 红色: 失败/错误
- ⚪ 灰色: 未连接/关闭

## 🔧 配置

### 环境变量

创建 `web/.env` 文件：

```env
# 信令服务器 URL
VITE_SIGNALING_URL=ws://localhost:8080

# 可选: 自定义 STUN/TURN 服务器
# VITE_ICE_SERVERS=stun:stun.l.google.com:19302
```

### 服务器配置

编辑 `server/src/index.ts`：

```typescript
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const avesServer = new AvesServer({
  debug: true, // 启用调试日志
  roomTimeout: 0, // 房间超时（0 = 永不超时）
});
```

## 🐛 故障排查

### 连接失败

1. 确认服务器正在运行：

   ```bash
   curl http://localhost:8080
   ```

2. 检查浏览器控制台错误

3. 检查防火墙设置

### WebRTC 连接失败

1. 打开 `chrome://webrtc-internals/` 查看详细信息

2. 检查 STUN 服务器是否可达

3. 尝试在同一网络环境下测试

### 消息发送失败

1. 检查连接状态指示器
2. 确认 DataChannel 状态为 `open`
3. 查看浏览器控制台错误

## 📝 技术栈

### 服务器

- **Node.js**: 运行时环境
- **TypeScript**: 类型安全
- **ws**: WebSocket 库
- **@yrzhao/aves-node**: 信令服务器库

### 客户端

- **Svelte**: UI 框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具
- **@yrzhao/aves-core**: WebRTC 客户端库
- **svelte-routing**: 路由管理

## 🎯 性能指标

- **消息延迟**: < 100ms（局域网）
- **连接建立时间**: < 3s
- **支持用户数**: 3-5 人（Mesh 网络）
- **消息吞吐量**: > 100 msg/s
- **内存使用**: < 100MB（单个客户端）

## 📚 相关文档

- [aves-core 文档](../aves-core/README.md)
- [aves-node 文档](../aves-node/README.md)
- [测试指南](./TESTING_GUIDE.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT

---

**提示**: 这是一个演示项目，主要用于测试和验证 aves-core 和 aves-node 的功能。生产环境使用请进行适当的安全加固和性能优化。
