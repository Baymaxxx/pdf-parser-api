FROM python:3.11-slim

# 安装 Tesseract OCR 及语言包
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ita \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Zeabur 通过 PORT 环境变量传入端口，默认 8080
EXPOSE 8080
CMD gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --timeout 120 --workers 2
