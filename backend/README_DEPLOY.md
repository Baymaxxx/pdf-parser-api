# PDF Parser API 本地部署指南

## 当前状态

✅ 本地服务已启动并运行
- 地址: http://localhost:3001
- 状态: 正常运行

## 内网穿透方案（让外部访问）

### 方案1: ngrok (推荐，最简单)

1. 注册 ngrok 账号: https://ngrok.com
2. 下载安装 ngrok:
   ```bash
   brew install ngrok
   # 或者下载: https://ngrok.com/download
   ```
3. 配置 authtoken:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```
4. 启动隧道:
   ```bash
   ngrok http 3001
   ```
5. 你会得到一个类似 `https://xxxx.ngrok-free.app` 的地址，这就是你的公网地址

### 方案2: Cloudflare Tunnel (免费，稳定)

1. 安装 cloudflared:
   ```bash
   brew install cloudflared
   ```
2. 登录 Cloudflare:
   ```bash
   cloudflared tunnel login
   ```
3. 创建隧道:
   ```bash
   cloudflared tunnel create pdf-parser
   ```
4. 运行隧道:
   ```bash
   cloudflared tunnel run --url http://localhost:3001 pdf-parser
   ```

### 方案3: 花生壳/Natapp (国内)

- 花生壳: https://hsk.oray.com
- Natapp: https://natapp.cn

## API 使用示例

### 健康检查
```bash
curl http://localhost:3001/
```

### 解析 PDF
```bash
curl -X POST \
  -F "file=@/path/to/your/invoice.pdf" \
  http://localhost:3001/api/parse-pdf
```

### Python 调用示例
```python
import requests

url = "http://localhost:3001/api/parse-pdf"
with open("invoice.pdf", "rb") as f:
    response = requests.post(url, files={"file": f})
    data = response.json()
    print(data)
```

## 停止服务

```bash
# 查找并停止 Flask 服务
lsof -ti:3001 | xargs kill -9
```

## 注意事项

1. **电脑需要保持开机** - 服务运行在你的电脑上，关机后无法访问
2. **网络稳定性** - 内网穿透依赖于你的网络连接
3. **安全性** - 内网穿透会暴露你的服务到公网，注意保护敏感数据
4. **防火墙** - 确保防火墙允许 3001 端口访问

## 长期运行建议

如果需要长期稳定运行，建议：
1. 使用云服务器（阿里云/腾讯云等）
2. 或者使用 Railway/Fly.io 等免费托管平台
