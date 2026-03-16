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
    """提取货号
    行格式示例: TH5660 AN0135146 0115 MONACO LOW GTX WHITE ROSE 64031900 PA ...
                LW4980 AF0132124 3500 IONACO LEEDS GTX COGNAC 64031900 PA ...
    货号 = 前缀数字部分(4位) + 后缀(4位)
    注意: OCR 可能将前缀识别为 LV/4980 等带噪声的形式
    """
    # 后缀：64031900 前面的4位数字（产品颜色码）
    suffix_match = re.search(r'(\d{4})\s+[A-Z][A-Z\s/]+\s+64031900', line)
    if not suffix_match:
        return None, None
    suffix = suffix_match.group(1)

    # 前缀：行首的货号，格式为 字母+数字，允许字母间有噪声字符（如 LV/4980）
    # 先尝试标准格式 [A-Z]{1,3}\d{4}
    prefix_match = re.match(r'^[A-Z]{1,3}(\d{4})', line.strip())
    if prefix_match:
        numeric_part = prefix_match.group(1)
        article_code = numeric_part + suffix
        return article_code, suffix

    # 容错：行首有噪声字符，提取前10个字符中的4位连续数字作为前缀数字部分
    head = line.strip()[:12]
    head_num_match = re.search(r'(\d{4})', head)
    if head_num_match:
        numeric_part = head_num_match.group(1)
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


def parse_text_pdf(pdf_bytes):
    """
    直接解析文本型 PDF（无需 OCR），精度更高。
    适用于 CRISPI SPORT 发票的数字版 PDF。
    行格式: TH5660 AN0135146 3200 MONACO LOW GTX BEIGE 64031900 PA 1,0 103,500000 103,50 82
    每条订单行单独输出，不合并，保留原始对应关系，方便核对。
    """
    all_products = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            lines = [l.strip() for l in text.split('\n') if l.strip()]

            # 提取当前页的订单参考号（*** Rif.Ord.: XX / YY*** Rif.Vs.Ord.: ZZZ）
            current_order_ref = ''

            i = 0
            while i < len(lines):
                line = lines[i]

                # 记录订单参考号
                ref_match = re.search(r'Rif\.Ord\.:\s*([\d/\s]+)\*+\s*Rif\.Vs\.Ord\.:\s*(\S+)', line)
                if ref_match:
                    current_order_ref = f"{ref_match.group(1).strip()} / {ref_match.group(2).strip()}"
                    i += 1
                    continue

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

                # 文本型PDF单价格式: PA 数量 单价(6位小数) [折扣%] 总价 82
                price_match = re.search(
                    r'PA\s+([\d,.]+)\s+([\d,.]+?)(?:\s+\d+%|\s+[\d.]+,\d{2}\s+82)',
                    line
                )
                if not price_match:
                    i += 1
                    continue

                line_qty_total = parse_italian_number(price_match.group(1))  # 本行总数量
                price = parse_italian_number(price_match.group(2))

                # 查找紧跟在商品行后面的 TGL 和 QTA 行
                # 遇到新商品行（含 64031900）时立即停止，防止跨商品行读取
                tgl_line = ''
                qta_line = ''
                for j in range(i + 1, min(i + 6, len(lines))):
                    next_line = lines[j]
                    if '64031900' in next_line:
                        break
                    if next_line.startswith('TGL'):
                        tgl_line = next_line
                    elif next_line.startswith('QTA'):
                        qta_line = next_line
                    if tgl_line and qta_line:
                        break

                if tgl_line and qta_line:
                    sizes = re.findall(r'\d+', tgl_line.replace('TGL', ''))
                    qtys = re.findall(r'\d+', qta_line.replace('QTA', ''))

                    for size, qty in zip(sizes, qtys):
                        qty_num = int(qty)
                        size_num = int(size)

                        # 过滤异常尺码（鞋码合理范围 35~50）
                        if qty_num <= 0 or size_num < 35 or size_num > 50:
                            continue

                        all_products.append({
                            'articleCode': article_code,
                            'description': product_name,
                            'size': size,
                            'qty': str(qty_num),
                            'price': f'{price:.2f}',
                            'discountedPrice': f'{price * 0.97:.2f}',
                            'page': page_num,
                            'orderRef': current_order_ref,
                        })

                i += 1

    return all_products


def is_text_pdf(pdf_bytes):
    """检测 PDF 是否为文本型（非图像型）"""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:3]:
            text = page.extract_text() or ''
            # 如果能提取到商品行特征，认为是文本型
            if '64031900' in text and 'PA' in text:
                return True
    return False


def ocr_pdf_detailed(pdf_bytes):
    """
    OCR 解析 PDF，返回明细数据（每个尺码一行）。
    每条订单行单独输出，不合并，保留原始对应关系，方便核对。
    """
    all_products = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # 转换为图像
            img = page.to_image(resolution=300).original

            # OCR 识别
            text = pytesseract.image_to_string(img, lang='eng+ita')
            lines = [l.strip() for l in text.split('\n') if l.strip()]

            current_order_ref = ''

            # 查找商品行
            i = 0
            while i < len(lines):
                line = lines[i]

                # 记录订单参考号
                ref_match = re.search(r'Rif\.Ord\.:\s*([\d/\s]+)\*+\s*Rif\.Vs\.Ord\.:\s*(\S+)', line)
                if ref_match:
                    current_order_ref = f"{ref_match.group(1).strip()} / {ref_match.group(2).strip()}"
                    i += 1
                    continue

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

                # 提取单价（原始值，不修正）
                price_match = re.search(r'PA\s+[\d,]+\s+([\d,]+)', line)
                if not price_match:
                    i += 1
                    continue

                price = parse_italian_number(price_match.group(1))

                # 查找下面的 TGL 和 QTA 行，遇到新商品行停止
                tgl_line = ''
                qta_line = ''
                for j in range(i + 1, min(i + 10, len(lines))):
                    nl = lines[j]
                    if '64031900' in nl:
                        break
                    if 'TGL' in nl:
                        tgl_line = nl
                    elif 'QTA' in nl:
                        qta_line = nl
                    if tgl_line and qta_line:
                        break

                # 解析尺码和数量，原始值直接输出，不做任何修正
                if tgl_line and qta_line:
                    sizes = re.findall(r'\d+', tgl_line.replace('TGL', ''))
                    qtys = re.findall(r'\d+', qta_line.replace('QTA', ''))

                    for size, qty in zip(sizes, qtys):
                        qty_num = int(qty)
                        size_num = int(size)
                        if qty_num <= 0 or size_num < 35 or size_num > 50:
                            continue
                        all_products.append({
                            'articleCode': article_code,
                            'description': product_name,
                            'size': size,
                            'qty': str(qty_num),
                            'price': f'{price:.2f}',
                            'discountedPrice': f'{price * 0.97:.2f}',
                            'page': page_num,
                            'orderRef': current_order_ref,
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
        # 优先尝试直接文本解析（文本型PDF精度更高）
        products = []
        if is_text_pdf(pdf_bytes):
            products = parse_text_pdf(pdf_bytes)

        # 文本解析无结果时回退到 OCR
        if not products:
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
