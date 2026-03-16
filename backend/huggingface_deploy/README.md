# Hugging Face Spaces 部署指南

## 快速部署步骤

### 1. 创建 Hugging Face 账号
访问 https://huggingface.co/join 注册（可以用 GitHub 账号直接登录）

### 2. 创建 Space
1. 访问 https://huggingface.co/spaces
2. 点击 "Create new Space"
3. 填写信息：
   - **Space name**: `pdf-parser-api`（或你喜欢的名字）
   - **License**: Apache 2.0
   - **Space SDK**: 选择 **Docker**
   - **Space hardware**: 选择 **CPU basic**（免费）
   - **Public**: 勾选（让外部可以访问）
4. 点击 "Create Space"

### 3. 上传代码
创建后，在 Space 页面点击 "Files" → "Upload files"
上传以下文件（从本目录复制）：
- `app.py`
- `Dockerfile`
- `requirements.txt`

### 4. 等待部署
上传后 Hugging Face 会自动构建和部署，约 2-5 分钟。

### 5. 访问服务
部署完成后，你的 API 地址为：
```
https://你的用户名-pdf-parser-api.hf.space/
```

## API 使用

### 健康检查
```bash
curl https://你的用户名-pdf-parser-api.hf.space/
```

### 解析 PDF
```bash
curl -X POST \
  -F "file=@invoice.pdf" \
  https://你的用户名-pdf-parser-api.hf.space/api/parse-pdf
```

## 注意事项

1. **免费额度**：Hugging Face Spaces 免费版有资源限制，长时间无访问会休眠
2. **首次启动慢**：休眠后首次访问需要等待 10-30 秒启动
3. **适合测试**：非常适合测试和演示，生产环境建议用付费服务器

## 文件说明

- `app.py` - Flask API 主程序
- `Dockerfile` - 容器配置（已预装 tesseract OCR）
- `requirements.txt` - Python 依赖
