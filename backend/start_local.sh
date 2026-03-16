#!/bin/bash
# 本地启动脚本

echo "🚀 启动 PDF Parser API 服务..."
echo ""

# 检查端口是否被占用
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  端口 3001 已被占用，正在停止旧进程..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    sleep 1
fi

# 检查依赖
echo "📦 检查依赖..."
python3 diagnose.py 2>&1 | grep -E "✗|✓" | head -10

echo ""
echo "🔧 启动服务..."
python3 app.py 2>&1 | tee /tmp/pdf-parser-api.log &

sleep 2

# 测试服务
echo ""
echo "✅ 测试服务..."
curl -s http://localhost:3001/ | python3 -m json.tool

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 服务已启动！"
echo "   URL: http://localhost:3001"
echo "   日志: /tmp/pdf-parser-api.log"
echo ""
echo "   测试命令:"
echo "   python3 test_api.py"
echo "   python3 test_full.py"
echo ""
echo "   停止服务:"
echo "   lsof -ti:3001 | xargs kill"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
