# 部署指南

## 本地开发

### 方式 1: 一键启动（推荐）

```bash
./start-dev.sh
```

### 方式 2: 分别启动

**终端 1 - 启动后端：**
```bash
cd backend
./start_local.sh
# 或
python app.py
```

**终端 2 - 启动前端：**
```bash
cd frontend
npm run dev
```

### 方式 3: 使用 npm scripts

```bash
# 安装根目录依赖（concurrently）
npm install

# 同时启动前后端
npm run dev
```

---

## Docker 部署

### 本地 Docker 测试

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 访问地址
- 前端: http://localhost:8080
- 后端: http://localhost:3001

---

## 云平台部署

### 1. Zeabur（推荐）

#### 后端部署
```bash
cd backend
# 按照 README_DEPLOY.md 中的步骤操作
```

#### 前端部署
```bash
cd frontend
# 1. 更新 .env 中的 VITE_PDF_API_URL 为后端地址
# 2. 按照 DEPLOY_COMPLETE.md 中的步骤操作
```

### 2. Railway

#### 后端部署
```bash
cd backend
./deploy-to-railway.sh
```

#### 前端部署
- 推荐使用 Vercel 部署前端
- 在 Vercel 环境变量中设置 `VITE_PDF_API_URL`

### 3. Vercel + Railway 组合

**前端 (Vercel):**
1. 连接 GitHub 仓库
2. 设置 Root Directory: `frontend`
3. 环境变量:
   ```
   VITE_PDF_API_URL=https://your-railway-backend.railway.app
   ```

**后端 (Railway):**
1. 连接 GitHub 仓库
2. 设置 Root Directory: `backend`
3. 自动检测 Python 并部署

### 4. Render.com

使用 `backend/render.yaml` 配置文件自动部署。

---

## 环境变量配置

### 前端环境变量

**开发环境** (`.env.local`):
```env
VITE_PDF_API_URL=http://localhost:3001
```

**生产环境** (`.env`):
```env
VITE_PDF_API_URL=https://your-api-domain.com
```

### 后端环境变量

```env
PORT=3001
FLASK_ENV=production
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

---

## 部署检查清单

### 后端部署前
- [ ] 确保 Tesseract OCR 已安装
- [ ] 检查 requirements.txt 依赖完整
- [ ] 配置 CORS 允许的域名
- [ ] 测试 API 端点

### 前端部署前
- [ ] 更新 `.env` 中的 API 地址
- [ ] 运行 `npm run build` 测试构建
- [ ] 检查所有环境变量
- [ ] 测试生产构建 `npm run preview`

### 部署后验证
- [ ] 前端页面可以正常访问
- [ ] 后端 API 健康检查通过
- [ ] PDF 上传解析功能正常
- [ ] CORS 配置正确
- [ ] 错误日志监控正常

---

## 常见部署问题

### Q1: 前端无法连接后端
**解决方案:**
1. 检查前端 `.env` 中的 `VITE_PDF_API_URL`
2. 检查后端 CORS 配置
3. 确认后端服务正常运行

### Q2: 后端 OCR 失败
**解决方案:**
```bash
# 确保安装 Tesseract
# macOS
brew install tesseract tesseract-lang

# Ubuntu/Debian
apt-get install tesseract-ocr tesseract-ocr-ita tesseract-ocr-eng

# 检查版本
tesseract --version
```

### Q3: Docker 构建失败
**解决方案:**
1. 清理 Docker 缓存: `docker system prune -a`
2. 检查 Dockerfile 路径
3. 确保有足够磁盘空间

### Q4: 端口冲突
**解决方案:**
```bash
# 查找占用端口的进程
lsof -ti:3001
lsof -ti:8080

# 停止进程
kill -9 <PID>
```

---

## 性能优化

### 前端优化
1. 启用代码分割
2. 压缩图片资源
3. 使用 CDN 加速
4. 启用 Gzip 压缩

### 后端优化
1. 添加 Redis 缓存
2. 使用 Gunicorn + Nginx
3. 启用响应压缩
4. 限制上传文件大小

---

## 监控和日志

### 日志收集
```bash
# Docker 日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 系统日志
tail -f backend/app.log
```

### 性能监控
- 使用 Sentry 监控错误
- 使用 LogRocket 记录用户会话
- 配置 Prometheus + Grafana

---

## 回滚策略

### Git 版本回滚
```bash
# 查看历史
git log --oneline

# 回滚到指定版本
git revert <commit-hash>
git push
```

### Docker 回滚
```bash
# 使用之前的镜像
docker-compose down
docker-compose up -d --force-recreate
```

---

## 技术支持

遇到问题？
1. 查看项目 README.md
2. 检查 backend/DEBUG_GUIDE.md
3. 运行诊断工具: `python backend/diagnose.py`
