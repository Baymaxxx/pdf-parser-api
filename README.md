# CRISPI Invoice Parser

一个完整的 PDF 发票解析系统，包含前端和后端服务。

## 项目结构

```
crispi-invoice-parser/
├── frontend/          # React 前端应用
├── backend/           # Python Flask API 服务
├── README.md          # 项目说明
├── package.json       # 根目录 package.json（用于统一管理脚本）
└── docker-compose.yml # Docker 编排配置
```

## 快速开始

### 开发环境

#### 1. 启动后端 API（端口 3001）

```bash
cd backend
pip install -r requirements.txt
python app.py
```

或使用提供的脚本：

```bash
cd backend
./start_local.sh
```

#### 2. 启动前端（端口 8080）

```bash
cd frontend
npm install  # 或 yarn install
npm run dev  # 或 yarn dev
```

### 一键启动（推荐）

在根目录运行：

```bash
npm run dev
```

这会同时启动前后端服务。

## 环境变量配置

### 前端环境变量（frontend/.env）

```env
VITE_PDF_API_URL=http://localhost:3001  # 本地开发
# VITE_PDF_API_URL=https://your-api.com  # 生产环境
```

### 后端环境变量（backend/.env）

```env
PORT=3001
FLASK_ENV=development
```

## Docker 部署

### 使用 Docker Compose（推荐）

```bash
docker-compose up -d
```

### 单独构建

```bash
# 后端
cd backend
docker build -t crispi-api .
docker run -p 3001:3001 crispi-api

# 前端
cd frontend
docker build -t crispi-frontend .
docker run -p 8080:8080 crispi-frontend
```

## 技术栈

### 前端
- React + Vite
- TailwindCSS
- PDF.js
- Tesseract.js

### 后端
- Python Flask
- pdfplumber
- pytesseract
- PIL

## API 文档

### POST /api/parse-pdf

上传 PDF 文件并解析。

**请求：**
```bash
curl -X POST \
  -F "file=@invoice.pdf" \
  http://localhost:3001/api/parse-pdf
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "articleCode": "ABC1234-5678",
      "description": "商品描述",
      "size": "42",
      "qty": "10",
      "price": "99.99"
    }
  ]
}
```

## 部署指南

### Zeabur 部署

前后端都可以部署到 Zeabur：

1. 后端：参考 `backend/README_DEPLOY.md`
2. 前端：参考 `frontend/DEPLOY_COMPLETE.md`

### Railway 部署

使用 `backend/deploy-to-railway.sh` 脚本。

### Vercel + Railway

- 前端部署到 Vercel
- 后端部署到 Railway
- 更新前端环境变量 `VITE_PDF_API_URL`

## 开发说明

### 前端开发

```bash
cd frontend
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本
npm run preview    # 预览生产构建
```

### 后端开发

```bash
cd backend
python app.py           # 启动服务
python test_api.py      # 测试 API
python diagnose.py      # 诊断工具
```

## 常见问题

### Q: 后端 OCR 识别失败？
A: 确保安装了 Tesseract OCR：
```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu
sudo apt-get install tesseract-ocr tesseract-ocr-ita tesseract-ocr-eng
```

### Q: 前端无法连接后端？
A: 检查：
1. 后端是否启动（http://localhost:3001）
2. 前端 `.env` 文件中的 `VITE_PDF_API_URL` 配置
3. CORS 配置是否正确

### Q: Docker 构建失败？
A: 确保 Docker 版本 >= 20.10，并且有足够的磁盘空间。

## License

MIT
