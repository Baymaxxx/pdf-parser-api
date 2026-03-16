#!/usr/bin/env python3
"""诊断脚本 - 检查所有依赖和配置"""
import sys
import subprocess

print("=" * 60)
print("PDF Parser API 诊断报告")
print("=" * 60)
print()

# 1. Python 版本
print("1. Python 版本:")
print(f"   {sys.version}")
print()

# 2. 检查依赖包
print("2. 依赖包检查:")
dependencies = [
    'flask',
    'flask_cors',
    'pdfplumber',
    'pytesseract',
    'PIL',
]

for dep in dependencies:
    try:
        mod = __import__(dep)
        version = getattr(mod, '__version__', 'unknown')
        print(f"   ✓ {dep}: {version}")
    except ImportError as e:
        print(f"   ✗ {dep}: 未安装 ({e})")
print()

# 3. 检查 tesseract
print("3. Tesseract OCR 检查:")
try:
    result = subprocess.run(['tesseract', '--version'],
                          capture_output=True, text=True)
    version_line = result.stdout.split('\n')[0]
    print(f"   ✓ {version_line}")
except FileNotFoundError:
    print("   ✗ tesseract 未安装或不在 PATH 中")
    print("   提示: brew install tesseract")
except Exception as e:
    print(f"   ✗ 检查失败: {e}")
print()

# 4. 检查 tesseract 语言包
print("4. Tesseract 语言包:")
try:
    result = subprocess.run(['tesseract', '--list-langs'],
                          capture_output=True, text=True)
    langs = result.stdout.strip().split('\n')[1:]  # 跳过第一行标题
    required = ['eng', 'ita']
    for lang in required:
        if lang in langs:
            print(f"   ✓ {lang}")
        else:
            print(f"   ✗ {lang} (需要安装)")
except Exception as e:
    print(f"   检查失败: {e}")
print()

# 5. 测试 pytesseract
print("5. pytesseract 功能测试:")
try:
    import pytesseract
    from PIL import Image
    import io

    # 创建简单测试图片
    img = Image.new('RGB', (100, 30), color='white')
    text = pytesseract.image_to_string(img)
    print(f"   ✓ pytesseract 可以正常调用")
except Exception as e:
    print(f"   ✗ 测试失败: {e}")
print()

# 6. 测试 pdfplumber
print("6. pdfplumber 功能测试:")
try:
    import pdfplumber
    import io
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter

    # 创建测试 PDF
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.drawString(100, 750, "Test")
    c.showPage()
    c.save()
    buffer.seek(0)

    with pdfplumber.open(buffer) as pdf:
        page = pdf.pages[0]
        img = page.to_image(resolution=150)
    print(f"   ✓ pdfplumber 可以正常工作")
except ImportError:
    print(f"   ⚠ 需要安装 reportlab 才能完整测试")
except Exception as e:
    print(f"   ✗ 测试失败: {e}")
print()

print("=" * 60)
print("诊断完成！")
print("=" * 60)
