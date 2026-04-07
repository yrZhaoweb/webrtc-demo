#!/bin/bash

# WebRTC Demo 测试环境快速设置脚本

set -e

echo "🚀 WebRTC Demo 测试环境设置"
echo "================================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Node.js
echo -e "\n${YELLOW}检查 Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# 检查 npm
echo -e "\n${YELLOW}检查 npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v)${NC}"

# 构建 aves-core
echo -e "\n${YELLOW}构建 aves-core...${NC}"
cd ../aves-core
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi
echo "构建..."
npm run build
echo -e "${GREEN}✅ aves-core 构建完成${NC}"

# 构建 aves-node
echo -e "\n${YELLOW}构建 aves-node...${NC}"
cd ../aves-node
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi
echo "构建..."
npm run build
echo -e "${GREEN}✅ aves-node 构建完成${NC}"

# 设置服务器
echo -e "\n${YELLOW}设置服务器...${NC}"
cd ../webrtc-demo/server
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi
echo -e "${GREEN}✅ 服务器设置完成${NC}"

# 设置 Web 客户端
echo -e "\n${YELLOW}设置 Web 客户端...${NC}"
cd ../web
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi
echo -e "${GREEN}✅ Web 客户端设置完成${NC}"

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}✅ 测试环境设置完成！${NC}"
echo -e "${GREEN}================================${NC}"

echo -e "\n${YELLOW}下一步：${NC}"
echo -e "1. 启动服务器："
echo -e "   ${GREEN}cd server && npm run dev${NC}"
echo -e "\n2. 在新终端启动 Web 客户端："
echo -e "   ${GREEN}cd web && npm run dev${NC}"
echo -e "\n3. 打开浏览器访问显示的 URL"
echo -e "\n4. 参考 TESTING_GUIDE.md 进行测试"

echo -e "\n${YELLOW}快速测试命令：${NC}"
echo -e "   ${GREEN}./test-run.sh${NC}"
