"""
PDF Invoice Parser API
部署到 Render.com 的 Flask 后端服务
解析 CRISPI SPORT 发票 PDF，返回结构化商品数据
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

# CORS: 允许 NoCode 前端域名访问
CORS(app, origins=[
    "http://localhost:*",
    "https://*.sankuai.com",
    "https://*.nocode.meituan.com",
    "https://*.webstatic.sankuai.com",
    "*",  # 开发阶段先放开，生产环境可收紧
])


def parse_italian_number(s):
    """意大利格式数字转浮点数"""
    s = s.strip().rstrip(',').rstrip('.')
    s = re.sub(r'[;|]', '', s)
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0


def ocr_pdf(pdf_bytes):
    """OCR解析PDF，返回商品数据列表"""
    all_lines = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            img = page.to_image(resolution=400).original
            w, h = img.size
            top = int(h * 0.22)
            bottom = int(h * 0.75)
            data_img = img.crop((0, top, w, bottom))
            gray = data_img.convert('L')
            enhanced = ImageEnhance.Contrast(gray).enhance(2.0)
            binary = enhanced.point(lambda x: 0 if x < 150 else 255, '1')
            text = pytesseract.image_to_string(binary, lang='eng+ita')
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            all_lines.extend(lines)

    products = []
    seen = set()

    for line in all_lines:
        if '64031900' not in line:
            continue
        if 'PALLET' in line.upper():
            continue
        if re.match(r'^\s*64031900\s+\d+\s*$', line):
            continue

        # 扩展 KNOWN_PREFIXES 以处理更多 OCR 错误
        KNOWN_PREFIXES = {
            'TH5660': 'TH5660', 'THS660': 'TH5660', 'TH56G0': 'TH5660',
            'TH5600': 'TH5600', 'THS600': 'TH5600',
            'LW4980': 'LW4980', 'LWw4980': 'LW4980', 'LW49B0': 'LW4980',
            'LX5024': 'LX5024', 'LXS024': 'LX5024', 'ILX5024': 'LX5024',
            'LW5725': 'LW5725', 'LWS725': 'LW5725', 'ILW5725': 'LW5725',
            'TH6230': 'TH6230', 'THS230': 'TH6230', 'TH62B0': 'TH6230',
        }

        prefix_match = re.search(r'([A-Z]{2}[A-Za-z0-9]\d{3,4})', line)
        prefix = prefix_match.group(1) if prefix_match else ''

        if prefix:
            corrected = KNOWN_PREFIXES.get(prefix)
            if not corrected:
                test = prefix.upper().replace('S', '5').replace('O', '0').replace('B', '8')
                if len(prefix) >= 2:
                    test = prefix[:2] + test[2:]
                corrected = KNOWN_PREFIXES.get(test, test)
            prefix = corrected

        suffix_match = re.search(r'[A-Z]{2}\d{6,9}\s+[=:.\s)*]*(\d{4})', line)
        suffix = suffix_match.group(1) if suffix_match else ''

        if not suffix:
            continue

        pa_match = re.search(
            r'(?:PA|P)\s+'
            r'([\d.,;]+)\s+'
            r'([\d.,]+)\s+'
            r'([\d.,]+)\s+'
            r'(\d+)',
            line
        )

        if not pa_match:
            pa_match2 = re.search(
                r'(?:PA|P)\s+'
                r'([\d.,]+)\s+'
                r'([\d.,]+)\s+'
                r'(\d+)',
                line
            )
            if pa_match2:
                price = parse_italian_number(pa_match2.group(1))
                total = parse_italian_number(pa_match2.group(2))
                if price > 50 and total > 0:
                    qty = round(total / price, 1)
                    if qty > 0 and qty == int(qty):
                        qty = int(qty)
                else:
                    continue
            else:
                continue
        else:
            qty = parse_italian_number(pa_match.group(1))
            price = parse_italian_number(pa_match.group(2))
            total = parse_italian_number(pa_match.group(3))

        # 修正 OCR 错误：如果数量是 40 但总价/40 不等于单价，可能是 4,0
        if qty == 40 and total > 0 and price > 0:
            expected_price = total / 40
            if abs(expected_price - price) / price > 0.5:  # 差异超过50%
                # 可能是 4,0 被识别成 40
                qty = 4.0
                total = price * 4.0

        if price < 50 or price > 200:
            continue
        if qty <= 0:
            continue

        expected_total = qty * price
        if total > 0 and abs(total - expected_total) / max(expected_total, 1) > 0.05:
            total = round(qty * price, 2)

        # 应用 3% 折扣计算折后单价
        discounted_price = price * 0.97

        name = ''
        if suffix:
            name_match = re.search(rf'{suffix}\s+(.+?)\s+\d{{8}}', line)
            if name_match:
                name = name_match.group(1).strip()
                name = re.sub(r'^[=+£»\d\s.:;]+', '', name).strip()
                name = re.sub(r'[/]', ' ', name).strip()
                name = re.sub(r'\s+', ' ', name).strip()
                name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
                name = name.replace('MONACOLOW', 'MONACO LOW')
                name = name.replace('MONACOLEEDS', 'MONACO LEEDS')
                name = name.replace('PERFETTAGTX', 'PERFETTA GTX')
                name = name.replace('LOWGTX', 'LOW GTX')
                name = name.replace('MONACO TINN', 'MONACO/TINN')
                name = re.sub(r'^[a-z]\s+', '', name).strip()

        if prefix and len(prefix) >= 4:
            numeric_part = re.sub(r'^[A-Za-z]+', '', prefix)
            article_code = numeric_part + suffix
        else:
            article_code = '????' + suffix

        NAME_BY_CODE = {
            '56600115': 'MONACO LOW GTX WHITE ROSE',
            '56603032': 'MONACO LOW GTX CHALK',
            '56600106': 'MONACO LOW GTX WHITE GOLD',
            '49803500': 'MONACO LEEDS GTX COGNAC',
            '56001500': 'MONACO TINN GTX ROSE',
            '50242412': 'MONACO GTX GREEN BORDEAUX',
            '56009900': 'MONACO TINN GTX BLACK',
            '57253200': 'MONACO PREMIUM URBN GTX BEIGE',
            '50243032': 'MONACO GTX CHALK',
            '62300100': 'PERFETTA GTX WHITE',
            '62303600': 'PERFETTA GTX TAN',
            '62309900': 'PERFETTA GTX BLACK',
            '56602460': 'MONACO LOW GTX GREEN GREY',
        }

        NAME_BY_SUFFIX = {
            '0115': 'MONACO LOW GTX WHITE ROSE',
            '3032': 'MONACO LOW GTX CHALK',
            '0106': 'MONACO LOW GTX WHITE GOLD',
            '3500': 'MONACO LEEDS GTX COGNAC',
            '1500': 'MONACO TINN GTX ROSE',
            '2412': 'MONACO GTX GREEN BORDEAUX',
            '9900': 'PERFETTA GTX BLACK',
            '3200': 'MONACO PREMIUM URBN GTX BEIGE',
            '0100': 'PERFETTA GTX WHITE',
            '3600': 'PERFETTA GTX TAN',
            '2460': 'MONACO LOW GTX GREEN GREY',
            '0000': 'PALLET',
        }

        if not name or len(name) < 3:
            name = NAME_BY_CODE.get(article_code) or NAME_BY_SUFFIX.get(suffix, '')

        key = f"{article_code}_{qty}_{price}"
        if key in seen:
            continue
        seen.add(key)

        products.append({
            'articleCode': article_code,
            'description': name or f'{prefix} {suffix}',
            'qty': str(int(qty)) if qty == int(qty) else str(qty),
            'price': f'{discounted_price:.2f}',
            'size': '-',
        })

    return products


@app.route('/', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok', 'service': 'PDF Parser API'})


@app.route('/api/parse-pdf', methods=['POST'])
def parse_pdf():
    """解析PDF发票"""
    # 从 multipart/form-data 获取文件
    if 'file' in request.files:
        file = request.files['file']
        pdf_bytes = file.read()
    else:
        # 兼容直接发送 PDF 二进制数据
        pdf_bytes = request.get_data()

    if not pdf_bytes:
        return jsonify({'success': False, 'error': '未找到PDF文件'}), 400

    # 验证文件大小（限制 10MB）
    if len(pdf_bytes) > 10 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'PDF文件过大（最大10MB）'}), 400

    # 验证 PDF 文件头
    if not pdf_bytes.startswith(b'%PDF'):
        return jsonify({'success': False, 'error': '文件格式错误，请上传有效的PDF文件'}), 400

    try:
        print(f'[API] 开始解析PDF ({len(pdf_bytes)} bytes)...')
        products = ocr_pdf(pdf_bytes)
        total_qty = sum(int(float(p['qty'])) for p in products)
        print(f'[API] 解析完成: {len(products)} 条记录, 总数量: {total_qty}')

        return jsonify({
            'success': True,
            'data': products,
            'count': len(products),
            'totalQty': total_qty,
        })
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f'[API] 解析失败: {e}')
        print(error_detail)

        # 提供更友好的错误信息
        error_msg = str(e)
        if 'No /Root object' in error_msg or 'PDF' in error_msg:
            error_msg = 'PDF文件损坏或格式不正确，请检查文件'
        elif 'tesseract' in error_msg.lower():
            error_msg = 'OCR服务不可用，请联系管理员'

        return jsonify({'success': False, 'error': error_msg}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port, debug=False)
