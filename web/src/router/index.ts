import { createRouter, createWebHistory } from "vue-router";

/**
 * 路由配置
 * Requirements: 1.3, 2.1
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // Requirement 1.3: Home 页面路由
      path: "/",
      name: "home",
      component: () => import("../views/Home.vue"),
    },
    {
      // Requirements: 1.3, 2.1: Room 页面路由，支持通过 URL 参数传递房间 ID
      // 支持两种方式：
      // 1. 路径参数: /room/:roomId
      // 2. 查询参数: /room?roomId=xxx
      path: "/room/:roomId?",
      name: "room",
      component: () => import("../views/Room.vue"),
      props: (route) => ({
        // 将路由参数和查询参数传递给组件
        roomId: route.params.roomId || route.query.roomId,
        userName: route.query.userName,
        userId: route.query.userId,
      }),
    },
  ],
});

export default router;
