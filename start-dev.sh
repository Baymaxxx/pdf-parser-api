#!/bin/bash

# CRISPI Invoice Parser - 开发环境启动脚本

echo "🚀 启动 CRISPI Invoice Parser 开发环境..."
echo ""

# 检查是否在项目根目录
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查后端依赖
echo -e "${BLUE}📦 检查后端依赖...${NC}"
if [ ! -f "backend/requirements.txt" ]; then
    echo "❌ backend/requirements.txt 不存在"
    exit 1
fi

# 2. 检查前端依赖
echo -e "${BLUE}📦 检查前端依赖...${NC}"
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⚠️  前端依赖未安装，正在安装...${NC}"
    cd frontend && npm install && cd ..
fi

# 3. 启动后端服务
echo -e "${GREEN}🔧 启动后端 API 服务（端口 3001）...${NC}"
cd backend
if [ -f "start_local.sh" ]; then
    chmod +x start_local.sh
    ./start_local.sh &
    BACKEND_PID=$!
else
    python app.py &
    BACKEND_PID=$!
fi
cd ..

# 等待后端启动
echo "⏳ 等待后端服务启动..."
sleep 3

# 检查后端是否启动成功
if curl -s http://localhost:3001/ > /dev/null; then
    echo -e "${GREEN}✅ 后端服务启动成功！${NC}"
else
    echo -e "${YELLOW}⚠️  后端服务可能未完全启动，继续...${NC}"
fi

# 4. 启动前端服务
echo -e "${GREEN}🎨 启动前端服务（端口 8080）...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}✨ 服务启动完成！${NC}"
echo ""
echo "📍 访问地址："
echo -e "   前端: ${BLUE}http://localhost:8080${NC}"
echo -e "   后端: ${BLUE}http://localhost:3001${NC}"
echo ""
echo "💡 提示："
echo "   - 按 Ctrl+C 停止所有服务"
echo "   - 查看日志请检查终端输出"
echo ""

# 等待用户中断
trap "echo ''; echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
