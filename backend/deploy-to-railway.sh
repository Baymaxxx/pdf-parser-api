#!/bin/bash

# Railway 一键部署脚本
# 使用方法: ./deploy-to-railway.sh

echo "================================"
echo "Railway 部署脚本"
echo "================================"
echo ""

# 检查 railway CLI
if ! command -v railway &> /dev/null; then
    echo "正在安装 Railway CLI..."
    npm install -g @railway/cli
fi

echo "✓ Railway CLI 已安装"
echo ""

# 登录 Railway
echo "步骤 1: 登录 Railway"
echo "这会打开浏览器让你授权..."
railway login

echo ""
echo "步骤 2: 初始化项目"
railway init

echo ""
echo "步骤 3: 部署服务"
railway up

echo ""
echo "步骤 4: 生成域名"
railway domain

echo ""
echo "================================"
echo "部署完成！"
echo "================================"
echo ""
echo "查看服务状态: railway status"
echo "查看日志: railway logs"
echo "打开 Dashboard: railway open"
echo ""
