#!/bin/bash

# PDF Parser API 启动脚本
# 使用方法: ./start_service.sh

echo "================================"
echo "PDF Parser API 服务启动脚本"
echo "================================"
echo ""

# 检查依赖
echo "[1/3] 检查依赖..."
python3 --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Python3 未安装"
    exit 1
fi
echo "✓ Python3 已安装"

# 检查端口是否被占用
PORT=3001
PID=$(lsof -ti :$PORT 2>/dev/null)
if [ ! -z "$PID" ]; then
    echo "⚠️  端口 $PORT 已被占用 (PID: $PID)，正在关闭..."
    kill -9 $PID 2>/dev/null
    sleep 1
fi

# 启动服务
echo ""
echo "[2/3] 启动 Flask 服务..."
echo "服务将在 http://localhost:$PORT 运行"
echo ""

# 在后台启动服务
nohup python3 app.py > server.log 2>&1 &
SERVER_PID=$!

# 等待服务启动
sleep 3

# 检查服务是否成功启动
if curl -s http://localhost:$PORT/ > /dev/null 2>&1; then
    echo "✅ 服务启动成功！"
    echo ""
    echo "================================"
    echo "本地访问地址: http://localhost:$PORT"
    echo "API 测试命令:"
    echo "  curl http://localhost:$PORT/"
    echo ""
    echo "上传 PDF 测试:"
    echo "  curl -X POST -F 'file=@your_file.pdf' http://localhost:$PORT/api/parse-pdf"
    echo "================================"
    echo ""
    echo "进程 PID: $SERVER_PID"
    echo "日志文件: server.log"
    echo ""
    echo "停止服务: kill $SERVER_PID"
else
    echo "❌ 服务启动失败，请检查 server.log"
    exit 1
fi
