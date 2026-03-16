# PDF Parser API 本地调试指南

## 问题诊断与修复

### 原始问题
服务返回 500 错误，主要原因：
1. 缺少意大利语 OCR 语言包
2. 错误处理不够完善，无效 PDF 导致服务崩溃
3. 没有文件格式验证

### 已修复的问题

#### 1. 改进错误处理 (app.py:232-275)
- ✅ 添加文件大小验证（最大 10MB）
- ✅ 添加 PDF 文件头验证
- ✅ 改进错误消息，提供更友好的提示
- ✅ 添加详细的错误日志（包含 traceback）
- ✅ 返回统一的错误响应格式（包含 `success: false`）

#### 2. 安装依赖
```bash
# Python 依赖
pip3 install -r requirements.txt

# Tesseract OCR 及语言包
brew install tesseract
brew install tesseract-lang  # 包含意大利语等语言包
```

## 本地调试步骤

### 1. 环境检查
运行诊断脚本检查所有依赖：
```bash
python3 diagnose.py
```

应该看到所有项都显示 ✓：
- Python 3.9+
- Flask 3.1.0
- pdfplumber 0.11.4
- pytesseract 0.3.13
- Pillow 11.1.0
- tesseract 5.5.2
- 语言包：eng, ita

### 2. 启动服务
```bash
# 开发模式（带日志）
python3 app.py

# 生产模式（使用 gunicorn）
gunicorn -w 4 -b 0.0.0.0:3001 app:app
```

服务将在 http://localhost:3001 启动

### 3. 测试 API

#### 健康检查
```bash
curl http://localhost:3001/
# 响应: {"status": "ok", "service": "PDF Parser API"}
```

#### 测试无效输入
```bash
# 运行测试脚本
python3 test_api.py

# 或手动测试
curl -X POST http://localhost:3001/api/parse-pdf \
  -F "file=@test.pdf"
```

#### 完整功能测试
```bash
python3 test_full.py
```

### 4. 查看日志
```bash
# 实时查看日志
tail -f /tmp/pdf-parser-api.log

# 查看最近的请求
tail -20 /tmp/pdf-parser-api.log
```

## API 接口说明

### GET /
健康检查接口
- **响应**: `{"status": "ok", "service": "PDF Parser API"}`

### POST /api/parse-pdf
解析 PDF 发票

**请求**:
- Content-Type: `multipart/form-data`
- 字段: `file` (PDF 文件)

**成功响应** (200):
```json
{
  "success": true,
  "data": [
    {
      "articleCode": "56600115",
      "description": "MONACO LOW GTX WHITE ROSE",
      "qty": "4",
      "price": "82.45",
      "size": "-"
    }
  ],
  "count": 1,
  "totalQty": 4
}
```

**错误响应** (400/500):
```json
{
  "success": false,
  "error": "错误描述"
}
```

**错误类型**:
- 400: 未找到 PDF 文件
- 400: PDF 文件过大（最大 10MB）
- 400: 文件格式错误，请上传有效的 PDF 文件
- 500: PDF 文件损坏或格式不正确
- 500: OCR 服务不可用

## 常见问题

### Q: 返回 500 错误
A: 检查：
1. 运行 `python3 diagnose.py` 确认所有依赖已安装
2. 确认 tesseract 语言包包含 `eng` 和 `ita`
3. 查看日志 `/tmp/pdf-parser-api.log` 了解详细错误

### Q: OCR 识别率低
A:
1. 确保 PDF 分辨率足够（代码中使用 400 DPI）
2. 检查 PDF 是否是扫描件而非原生 PDF
3. 调整图像预处理参数（对比度、二值化阈值等）

### Q: 依赖冲突
A: 项目依赖可能与系统其他包冲突（如 lyrebird）。建议使用虚拟环境：
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 部署注意事项

1. **生产环境使用 gunicorn**，不要使用 Flask 开发服务器
2. **设置环境变量** `PORT` 指定端口（默认 3001）
3. **配置 CORS** 根据实际前端域名调整 `app.py:21-27`
4. **资源限制**: 每个 PDF 最大 10MB，建议配置 nginx/gunicorn 的请求大小限制
5. **日志**: 生产环境配置日志到文件或日志服务

## 测试文件说明

- `test_api.py`: 基础 API 测试（空文件、无效文件）
- `test_full.py`: 完整功能测试（包含真实 PDF 解析）
- `diagnose.py`: 环境诊断脚本

## 版本信息

- 最后更新: 2026-03-15
- Python: 3.9.6
- Flask: 3.1.0
- Tesseract: 5.5.2
