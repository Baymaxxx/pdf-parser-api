#!/usr/bin/env python3
"""测试 PDF Parser API"""
import requests

# 测试健康检查
print("测试健康检查...")
response = requests.get("http://localhost:3001/")
print(f"状态码: {response.status_code}")
print(f"响应: {response.json()}")
print()

# 测试空文件上传（应该返回 400）
print("测试空文件上传...")
response = requests.post("http://localhost:3001/api/parse-pdf", data=b"")
print(f"状态码: {response.status_code}")
print(f"响应: {response.json()}")
print()

# 测试无效 PDF（应该返回 500）
print("测试无效 PDF...")
response = requests.post("http://localhost:3001/api/parse-pdf",
                         files={"file": ("test.pdf", b"invalid pdf content")})
print(f"状态码: {response.status_code}")
print(f"响应: {response.json()}")
print()

print("测试完成！")
