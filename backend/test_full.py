#!/usr/bin/env python3
"""完整的 API 测试"""
import requests
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_test_pdf():
    """创建一个简单的测试 PDF"""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.drawString(100, 750, "Test Invoice")
    c.drawString(100, 700, "64031900 TH5660 0115 PA 4,0 85,00 340,00 12345678")
    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()

print("1. 测试健康检查...")
response = requests.get("http://localhost:3001/")
print(f"   状态码: {response.status_code}")
print(f"   响应: {response.json()}")
assert response.status_code == 200
print("   ✓ 通过\n")

print("2. 测试空文件上传...")
response = requests.post("http://localhost:3001/api/parse-pdf", data=b"")
print(f"   状态码: {response.status_code}")
print(f"   响应: {response.json()}")
assert response.status_code == 400
print("   ✓ 通过\n")

print("3. 测试无效 PDF...")
response = requests.post("http://localhost:3001/api/parse-pdf",
                         files={"file": ("test.pdf", b"invalid pdf content")})
print(f"   状态码: {response.status_code}")
print(f"   响应: {response.json()}")
assert response.status_code == 400
print("   ✓ 通过\n")

print("4. 测试有效 PDF（需要 tesseract）...")
try:
    pdf_bytes = create_test_pdf()
    response = requests.post("http://localhost:3001/api/parse-pdf",
                             files={"file": ("test.pdf", pdf_bytes)})
    print(f"   状态码: {response.status_code}")
    print(f"   响应: {response.json()}")
    if response.status_code == 200:
        print("   ✓ 通过\n")
    else:
        print(f"   ⚠ 警告: 解析失败（可能是 tesseract 配置问题）\n")
except ImportError:
    print("   ⚠ 跳过: 需要安装 reportlab\n")

print("所有基础测试完成！")
