#!/bin/bash

# WebRTC Demo 停止脚本

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 停止 WebRTC Demo 服务${NC}"
echo "================================"

# 停止服务器
if [ -f "logs/server.pid" ]; then
    SERVER_PID=$(cat logs/server.pid)
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}停止服务器 (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID
        echo -e "${GREEN}✅ 服务器已停止${NC}"
    else
        echo -e "${RED}⚠️  服务器进程不存在${NC}"
    fi
    rm logs/server.pid
else
    echo -e "${YELLOW}⚠️  未找到服务器 PID 文件${NC}"
fi

# 停止 Web 客户端
if [ -f "logs/web.pid" ]; then
    WEB_PID=$(cat logs/web.pid)
    if ps -p $WEB_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}停止 Web 客户端 (PID: $WEB_PID)...${NC}"
        kill $WEB_PID
        echo -e "${GREEN}✅ Web 客户端已停止${NC}"
    else
        echo -e "${RED}⚠️  Web 客户端进程不存在${NC}"
    fi
    rm logs/web.pid
else
    echo -e "${YELLOW}⚠️  未找到 Web 客户端 PID 文件${NC}"
fi

# 清理可能残留的进程
echo -e "\n${YELLOW}清理残留进程...${NC}"
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}✅ 所有服务已停止${NC}"
echo -e "${GREEN}================================${NC}"
