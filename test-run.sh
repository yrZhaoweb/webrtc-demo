#!/bin/bash

# WebRTC Demo 快速运行脚本
# 同时启动服务器和客户端

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 启动 WebRTC Demo${NC}"
echo "================================"

# 检查是否已经设置
if [ ! -d "server/node_modules" ] || [ ! -d "web/node_modules" ]; then
    echo -e "${YELLOW}⚠️  检测到未完成设置，运行设置脚本...${NC}"
    ./test-setup.sh
fi

# 创建日志目录
mkdir -p logs

echo -e "\n${GREEN}启动服务器...${NC}"
cd server
npm run dev > ../logs/server.log 2>&1 &
SERVER_PID=$!
echo -e "${GREEN}✅ 服务器已启动 (PID: $SERVER_PID)${NC}"

# 等待服务器启动
sleep 2

echo -e "\n${GREEN}启动 Web 客户端...${NC}"
cd ../web
npm run dev > ../logs/web.log 2>&1 &
WEB_PID=$!
echo -e "${GREEN}✅ Web 客户端已启动 (PID: $WEB_PID)${NC}"

# 保存 PID
cd ..
echo $SERVER_PID > logs/server.pid
echo $WEB_PID > logs/web.pid

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo -e "${GREEN}================================${NC}"

echo -e "\n${YELLOW}服务信息：${NC}"
echo -e "  服务器: ${GREEN}ws://localhost:8080${NC}"
echo -e "  Web 客户端: ${GREEN}http://localhost:5173${NC}"
echo -e "\n${YELLOW}日志文件：${NC}"
echo -e "  服务器: ${GREEN}logs/server.log${NC}"
echo -e "  客户端: ${GREEN}logs/web.log${NC}"

echo -e "\n${YELLOW}查看日志：${NC}"
echo -e "  服务器: ${GREEN}tail -f logs/server.log${NC}"
echo -e "  客户端: ${GREEN}tail -f logs/web.log${NC}"

echo -e "\n${YELLOW}停止服务：${NC}"
echo -e "  ${GREEN}./test-stop.sh${NC}"

echo -e "\n${BLUE}🎉 准备就绪！打开浏览器访问 http://localhost:5173${NC}"
