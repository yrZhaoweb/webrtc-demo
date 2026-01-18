# WebRTC 聊天室

基于 WebRTC 的实时点对点文本聊天应用。

## 📁 项目结构

```
webrtc-demo/
├── server/          # Node.js WebSocket 信令服务器
│   ├── src/
│   │   ├── index.ts        # 服务器入口
│   │   ├── roomManager.ts  # 房间管理
│   │   └── types.ts        # 类型定义
│   └── package.json
│
├── web/             # Vue 3 + TypeScript 前端应用
│   ├── src/
│   │   ├── views/          # 页面组件
│   │   ├── services/       # 核心服务
│   │   ├── composables/    # 状态管理
│   │   ├── types/          # 类型定义
│   │   └── utils/          # 工具函数
│   └── package.json
│
└── TESTING_GUIDE.md # 详细测试指南
```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 安装服务器依赖
cd server
npm install

# 安装 Web 客户端依赖
cd ../web
npm install
```

### 启动应用

**终端 1 - 启动服务器：**

```bash
cd server
npm run dev
```

**终端 2 - 启动 Web 客户端：**

```bash
cd web
npm run dev
```

### 访问应用

打开浏览器访问：`http://localhost:5173`

## 💬 如何使用

### 创建房间

1. 访问首页
2. 输入你的名字
3. 点击"确认创建"
4. 自动跳转到房间页面

### 邀请其他人

1. 在房间页面找到"邀请链接"
2. 点击"复制"按钮
3. 将链接发送给朋友
4. 朋友打开链接即可加入聊天

### 发送消息

1. 在底部输入框输入消息
2. 按回车或点击"发送"按钮
3. 消息通过 WebRTC DataChannel 直接发送给其他用户

## 🏗️ 技术栈

### 后端

- **Node.js** - 运行时环境
- **WebSocket (ws)** - 信令服务器
- **TypeScript** - 类型安全
- **UUID** - 生成唯一房间 ID

### 前端

- **Vue 3** - 渐进式框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Vue Router** - 路由管理
- **WebRTC** - 点对点通信

## 🔧 开发命令

### 服务器

```bash
cd server

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 生产模式
npm start

# 运行测试
npm test
```

### Web 客户端

```bash
cd web

# 开发模式
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview
```

## 📖 详细文档

- [测试指南](./TESTING_GUIDE.md) - 完整的测试步骤和问题排查
- [需求文档](../.kiro/specs/webrtc-chatroom/requirements.md) - 功能需求
- [设计文档](../.kiro/specs/webrtc-chatroom/design.md) - 技术设计
- [任务列表](../.kiro/specs/webrtc-chatroom/tasks.md) - 实现计划

## 🌟 功能特性

- ✅ 创建和加入聊天室
- ✅ 实时点对点文本通信
- ✅ 多用户支持（完全网状拓扑）
- ✅ 参与者列表实时更新
- ✅ 邀请链接分享
- ✅ 用户加入/离开通知
- ✅ 响应式 UI 设计
- ✅ 自动重连机制

## 🔒 隐私和安全

- 所有消息通过 WebRTC DataChannel 点对点传输
- 服务器仅用于信令交换，不存储或转发聊天内容
- 房间在最后一个用户离开后自动清理
- 不需要用户注册或登录

## 🐛 已知限制

- 需要在同一网络或可互相访问的网络环境
- 跨网络可能需要配置 STUN/TURN 服务器
- 房间数据仅存储在内存中（服务器重启后丢失）
- 不支持消息历史记录

## 🚧 未来改进

- [ ] 添加 STUN/TURN 服务器支持
- [ ] 实现消息持久化
- [ ] 添加文件传输功能
- [ ] 支持视频/音频通话
- [ ] 添加端到端加密
- [ ] 实现房间密码保护

## 📝 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
