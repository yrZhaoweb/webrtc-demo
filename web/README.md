# WebRTC 聊天室 - Svelte + TypeScript + Vite

基于 WebRTC 的实时点对点文本聊天应用，使用 Svelte + TypeScript + Vite 构建。

## 技术栈

- **Svelte 4** - 响应式 UI 框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **svelte-routing** - 客户端路由
- **@yrzhao/aves-core** - WebRTC 客户端库

## 功能特性

- ✅ 创建和加入聊天室
- ✅ 实时点对点消息传输
- ✅ 在线用户列表
- ✅ 邀请链接分享
- ✅ 全局错误处理
- ✅ 网络状态监控
- ✅ 响应式设计

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run check

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
src/
├── lib/                    # 共享库
│   ├── stores/            # Svelte stores
│   │   ├── error.ts       # 错误状态管理
│   │   ├── network.ts     # 网络状态管理
│   │   └── index.ts       # Store 导出
│   ├── chat.ts            # 聊天逻辑
│   └── types.ts           # TypeScript 类型
├── routes/                # 路由组件
│   ├── Home.svelte        # 首页
│   └── Room.svelte        # 聊天室
├── services/              # 服务层
│   └── avesService.ts     # WebRTC 服务
├── utils/                 # 工具函数
│   └── index.ts
├── App.svelte             # 根组件
├── main.ts                # 应用入口
└── style.css              # 全局样式
```

## 架构说明

### 状态管理

使用 Svelte 内置的 Stores 进行状态管理：

- **errorStore**: 全局错误状态
- **networkStore**: 网络连接状态
- **avesService**: WebRTC 客户端和房间状态

### 路由

使用 `svelte-routing` 实现客户端路由：

- `/` - 首页（创建房间）
- `/room/:roomId` - 聊天室页面

### WebRTC 集成

通过 `@yrzhao/aves-core` 库实现 WebRTC 功能，支持：

- 房间创建和加入
- 点对点消息传输
- 用户状态管理

## 从 Vue 迁移

本项目已从 Vue 3 完全迁移到 Svelte，主要变更：

- Vue Composition API → Svelte Stores
- Vue Router → svelte-routing
- .vue 文件 → .svelte 文件
- ref/computed → writable/derived stores
- onMounted/onUnmounted → onMount/onDestroy

所有功能保持不变，UI/UX 完全一致。

## License

MIT
