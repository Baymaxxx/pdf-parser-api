# 🚀 快速开始指南

## 项目结构

```
crispi-invoice-parser/
├── frontend/              # React 前端 (端口 8080)
│   ├── src/              # 源代码
│   ├── public/           # 静态资源
│   ├── package.json      # 前端依赖
│   └── .env.local        # 本地环境变量
│
├── backend/              # Flask 后端 (端口 3001)
│   ├── app.py           # 主应用
│   ├── requirements.txt # Python 依赖
│   └── start_local.sh   # 启动脚本
│
├── start-dev.sh         # 一键启动脚本
├── docker-compose.yml   # Docker 编排
├── package.json         # 根目录脚本
└── README.md           # 完整文档
```

---

## ⚡ 最快启动方式

### 方式 1: 一键启动（推荐）

```bash
cd /Users/zhongshuai/Downloads/crispi-invoice-parser
./start-dev.sh
```

✅ 这会自动启动前后端服务！

### 方式 2: 使用 npm

```bash
# 1. 安装依赖（首次运行）
npm install

# 2. 启动服务
npm run dev
```

### 方式 3: 分别启动

**终端 1 - 后端：**
```bash
cd backend
python app.py
```

**终端 2 - 前端：**
```bash
cd frontend
npm run dev
```

---

## 📍 访问地址

启动成功后，打开浏览器访问：

- **前端应用**: http://localhost:8080
- **后端 API**: http://localhost:3001
- **API 文档**: http://localhost:3001/api/parse-pdf

---

## 🔧 首次安装依赖

### 前端依赖

```bash
cd frontend
npm install
# 或
yarn install
```

### 后端依赖

```bash
cd backend
pip install -r requirements.txt
```

**macOS 用户需要安装 Tesseract:**
```bash
brew install tesseract tesseract-lang
```

**Linux 用户:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-ita tesseract-ocr-eng
```

---

## 🧪 测试功能

### 1. 测试后端 API

```bash
cd backend
python test_api.py
```

### 2. 上传 PDF 测试

```bash
curl -X POST \
  -F "file=@your-invoice.pdf" \
  http://localhost:3001/api/parse-pdf
```

### 3. 在前端界面测试

1. 打开 http://localhost:8080
2. 拖拽或点击上传 PDF 文件
3. 查看解析结果

---

## 🐳 Docker 部署

### 一键启动所有服务

```bash
docker-compose up -d
```

### 查看日志

```bash
docker-compose logs -f
```

### 停止服务

```bash
docker-compose down
```

---

## 🛠️ 常用命令

### 开发命令

```bash
npm run dev              # 同时启动前后端
npm run dev:frontend     # 只启动前端
npm run dev:backend      # 只启动后端
npm run build           # 构建前端
npm run test:backend    # 测试后端 API
```

### 清理命令

```bash
npm run clean           # 清理构建产物
```

---

## ❓ 常见问题

### Q1: 端口被占用

```bash
# 查找占用端口的进程
lsof -ti:3001  # 后端
lsof -ti:8080  # 前端

# 停止进程
kill -9 <PID>
```

### Q2: 前端无法连接后端

检查 `frontend/.env.local`:
```env
VITE_PDF_API_URL=http://localhost:3001
```

### Q3: 后端 OCR 失败

确保安装了 Tesseract:
```bash
tesseract --version
```

如果没有安装：
```bash
brew install tesseract tesseract-lang
```

### Q4: npm install 失败

尝试清理缓存：
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## 📚 更多文档

- **完整文档**: [README.md](./README.md)
- **部署指南**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **后端调试**: [backend/DEBUG_GUIDE.md](./backend/DEBUG_GUIDE.md)

---

## 🎯 下一步

1. ✅ 启动开发服务器
2. ✅ 上传测试 PDF 文件
3. ✅ 查看解析结果
4. 📖 阅读完整文档了解更多功能
5. 🚀 部署到生产环境

---

## 💡 提示

- 前端代码修改会自动热重载
- 后端代码修改需要手动重启服务
- 使用 `Ctrl+C` 停止服务
- 查看终端日志排查问题

---

祝你使用愉快！🎉
