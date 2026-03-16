"""
优化的 PDF Invoice Parser API
解析 CRISPI SPORT 发票 PDF，返回明细数据（每个尺码一行）
"""
import os
import json
import re
import io

from flask import Flask, request, jsonify
from flask_cors import CORS

import pdfplumber
import pytesseract
from PIL import Image, ImageEnhance

app = Flask(__name__)

CORS(app, origins=["*"])


def parse_italian_number(s):
    """意大利格式数字转浮点数"""
    s = str(s).strip().rstrip(',').rstrip('.')
    s = re.sub(r'[;|]', '', s)
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0


def extract_article_code(line):
    """提取货号"""
    # 查找模式：TH5660 ... 0115
    prefix_match = re.search(r'([A-Z]{2}\d{4})', line)
    suffix_match = re.search(r'(\d{4})\s+[A-Z\s/]+\s+64031900', line)

    if prefix_match and suffix_match:
        prefix = prefix_match.group(1)
        suffix = suffix_match.group(1)

        # 提取数字部分
        numeric_part = re.sub(r'^[A-Za-z]+', '', prefix)
        article_code = numeric_part + suffix

        return article_code, suffix

    return None, None


def extract_product_name(line, suffix):
    """提取产品名称"""
    # 在货号后缀和 64031900 之间的文字
    pattern = rf'{suffix}\s+(.+?)\s+64031900'
    match = re.search(pattern, line)

    if match:
        name = match.group(1).strip()
        # 清理名称
        name = re.sub(r'^[=+£»\d\s.:;]+', '', name).strip()
        name = re.sub(r'[/]', ' ', name).strip()
        name = re.sub(r'\s+', ' ', name).strip()

        # 常见替换
        replacements = {
            'MONACOLOW': 'MONACO LOW',
            'MONACOLEEDS': 'MONACO LEEDS',
            'PERFETTAGTX': 'PERFETTA GTX',
            'LOWGTX': 'LOW GTX',
            'MONACO TINN': 'MONACO/TINN',
            'IONACO': 'MONACO',
        }

        for old, new in replacements.items():
            name = name.replace(old, new)

        return name

    return ''


def ocr_pdf_detailed(pdf_bytes):
    """
    OCR 解析 PDF，返回明细数据（每个尺码一行）
    """
    all_products = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # 转换为图像
            img = page.to_image(resolution=300).original

            # OCR 识别
            text = pytesseract.image_to_string(img, lang='eng+ita')
            lines = [l.strip() for l in text.split('\n') if l.strip()]

            # 查找商品行
            i = 0
            while i < len(lines):
                line = lines[i]

                # 跳过不相关的行
                if '64031900' not in line or 'PA' not in line:
                    i += 1
                    continue

                # 提取货号
                article_code, suffix = extract_article_code(line)
                if not article_code:
                    i += 1
                    continue

                # 提取产品名称
                product_name = extract_product_name(line, suffix)

                # 提取单价
                price_match = re.search(r'PA\s+[\d,]+\s+([\d,]+)', line)
                if not price_match:
                    i += 1
                    continue

                price = parse_italian_number(price_match.group(1))

                # 查找下面的 TGL 和 QTA 行
                tgl_line = ''
                qta_line = ''

                for j in range(i + 1, min(i + 10, len(lines))):
                    if 'TGL' in lines[j]:
                        tgl_line = lines[j]
                    elif 'QTA' in lines[j]:
                        qta_line = lines[j]

                    if tgl_line and qta_line:
                        break

                # 解析尺码和数量
                if tgl_line and qta_line:
                    # 提取尺码
                    sizes = re.findall(r'\d+', tgl_line.replace('TGL', ''))
                    # 提取数量
                    qtys = re.findall(r'\d+', qta_line.replace('QTA', ''))

                    # OCR 错误修正：检查是否有超过 100 的数量（通常是 OCR 错误）
                    corrected_qtys = []
                    for qty_str in qtys:
                        qty = int(qty_str)
                        # 如果数量超过 100，尝试拆分（假设是 OCR 把多个数字粘在一起）
                        # 例如 197 -> 19, 7（两位数 + 一位数）
                        if qty > 100:
                            if len(qty_str) == 3:
                                # 拆分成两位数 + 一位数
                                corrected_qtys.append(int(qty_str[:2]))
                                corrected_qtys.append(int(qty_str[2:]))
                            else:
                                # 其他情况保持原样
                                corrected_qtys.append(qty)
                        else:
                            corrected_qtys.append(qty)
                    qtys = [str(q) for q in corrected_qtys]

                    # 配对尺码和数量
                    if sizes and qtys:
                        for size, qty in zip(sizes, qtys):
                            qty_num = int(qty)
                            if qty_num > 0:
                                all_products.append({
                                    'articleCode': article_code,
                                    'description': product_name,
                                    'size': size,
                                    'qty': str(qty_num),
                                    'price': f'{price:.2f}',
                                    'discountedPrice': f'{price * 0.97:.2f}',  # 3% 折扣
                                })

                i += 1

    return all_products


@app.route('/', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok', 'service': 'PDF Parser API (Detailed)'})


@app.route('/api/parse-pdf', methods=['POST'])
def parse_pdf():
    """解析PDF发票 - 返回明细数据"""
    if 'file' in request.files:
        file = request.files['file']
        pdf_bytes = file.read()
    else:
        pdf_bytes = request.get_data()

    if not pdf_bytes:
        return jsonify({'success': False, 'error': '未找到PDF文件'}), 400

    if len(pdf_bytes) > 10 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'PDF文件过大（最大10MB）'}), 400

    try:
        products = ocr_pdf_detailed(pdf_bytes)

        if not products:
            return jsonify({
                'success': False,
                'error': '未能识别到商品数据'
            }), 400

        return jsonify({
            'success': True,
            'count': len(products),
            'data': products
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'解析失败: {str(e)}'
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port, debug=False)
