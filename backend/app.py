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
import numpy as np
from PIL import Image, ImageEnhance

app = Flask(__name__)

CORS(app, origins=["*"])


def parse_italian_number(s):
    """意大利格式数字转浮点数
    支持格式：
    - 104,500000  → 104.50（单价，逗号后6位小数）
    - 104500000   → 104.50（OCR 丢失逗号的单价，8位纯数字）
    - 1.234,56    → 1234.56（千位分隔符+小数）
    - 104,50      → 104.50（普通小数）
    """
    s = str(s).strip().rstrip(',').rstrip('.')
    s = re.sub(r'[;|]', '', s)
    if ',' in s and '.' in s:
        # 1.234,56 格式：点是千位分隔符，逗号是小数点
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        # 检查逗号后面的位数
        parts = s.split(',')
        decimal_part = parts[-1]
        if len(decimal_part) > 2:
            # 104,500000 → 单价格式，只取前2位小数
            s = parts[0] + '.' + decimal_part[:2]
        else:
            s = s.replace(',', '.')
    elif re.match(r'^\d{7,9}$', s):
        # OCR 丢失逗号：意大利单价格式末6位是小数（如 104500000 → 104.50）
        # 格式：整数部分 + 6位小数 → 取整数部分 + 前2位小数
        int_part = s[:-6]
        dec_part = s[-6:-4]
        s = int_part + '.' + dec_part
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


def _otsu_threshold(arr):
    """计算 Otsu 最优二值化阈值"""
    hist, _ = np.histogram(arr.flatten(), bins=256, range=(0, 256))
    total = arr.size
    sum_total = np.dot(np.arange(256), hist)
    sum_b, w_b, max_var, threshold = 0, 0, 0, 0
    for t in range(256):
        w_b += hist[t]
        if w_b == 0:
            continue
        w_f = total - w_b
        if w_f == 0:
            break
        sum_b += t * hist[t]
        m_b = sum_b / w_b
        m_f = (sum_total - sum_b) / w_f
        var = w_b * w_f * (m_b - m_f) ** 2
        if var > max_var:
            max_var = var
            threshold = t
    return threshold


def _detect_pipe_xs(img, y1, y2, x_start=250, x_end=2700, min_gap=80):
    """用列像素均值检测 TGL/QTA 表格的竖线 x 坐标"""
    region = img.crop((x_start, y1, x_end, y2))
    gray = np.array(region.convert('L'))
    col_means = gray.mean(axis=0)
    dark_cols = np.where(col_means < 150)[0]
    if len(dark_cols) == 0:
        return []
    groups = []
    cur = [int(dark_cols[0])]
    for c in dark_cols[1:]:
        if c - cur[-1] <= 5:
            cur.append(int(c))
        else:
            groups.append(cur)
            cur = [int(c)]
    groups.append(cur)
    raw = sorted([int(np.mean(g)) + x_start for g in groups if len(g) >= 2])
    filtered = [raw[0]]
    for x in raw[1:]:
        if x - filtered[-1] > min_gap:
            filtered.append(x)
    return filtered


# 字体特征字符映射表（这个 PDF 使用特殊字体，部分字符被 OCR 误识别）
_SIZE_CHAR_MAP = {
    'A': '4', 'a': '4',
    'Q': '0', 'O': '0', 'o': '0',
    'I': '1', 'l': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6', 'g': '6',
    'T': '7', 'f': '7',  # 7 的顶部横线有时被识别成 f
    'B': '8', 'b': '8',
    'q': '9', 'e': '9',  # 9 的字体特征
}
_QTY_CHAR_MAP = {
    'A': '4', 'a': '4',
    'Q': '9',  # 数量行中单个 Q = 9
    'O': '0', 'o': '0',
    'I': '1', 'l': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6', 'g': '6',
    'T': '7', 'f': '7',
    'B': '8', 'b': '8',
    'q': '9', 'e': '9',
}


def _apply_char_map(text, char_map):
    return ''.join(char_map.get(c, c) if not c.isdigit() else c for c in text)


def _fix_size(raw_text):
    """修正 OCR 识别的鞋码，返回有效鞋码字符串或 None"""
    if not raw_text:
        return None
    # 单个 Q 在尺码行不合法，跳过
    if raw_text.strip() == 'Q':
        return None
    text = _apply_char_map(raw_text, _SIZE_CHAR_MAP)
    digits = re.sub(r'\D', '', text)
    if len(digits) == 2:
        n = int(digits)
        if 35 <= n <= 50:
            return digits
        # 末位 2→3 修正：字体中 3 有时被识别成 2（如 A2→43）
        if digits[1] == '2':
            alt = digits[0] + '3'
            if 35 <= int(alt) <= 50:
                return alt
    return None


def _fix_qty(raw_text):
    """修正 OCR 识别的数量，返回有效数量字符串或 None"""
    if not raw_text:
        return None
    # 单个 Q = 9
    if raw_text.strip() in ('Q', 'q'):
        return '9'
    # 如果有多个词，只取第一个（避免多词拼接成异常大数字）
    first_word = raw_text.strip().split()[0] if raw_text.strip() else ''
    text = _apply_char_map(first_word, _QTY_CHAR_MAP)
    digits = re.sub(r'\D', '', text)
    if digits and 0 < int(digits) <= 999:
        return digits
    return None


def _ocr_row_by_col(img, y1, y2, pipe_xs, x_start=250, scale=4, fixed_thresh=None):
    """
    对一行做二值化 + psm11 OCR，
    用每个词的 x 坐标匹配到对应的竖线列，返回 {col_idx: [text, ...]}
    fixed_thresh: 固定二值化阈值（None 则用 Otsu 自适应）
    """
    x_end = pipe_xs[-1] + 20 if pipe_xs else x_start + 700
    row = img.crop((x_start, y1, x_end, y2))
    big = row.resize((row.width * scale, row.height * scale), Image.LANCZOS)
    arr = np.array(big.convert('L'))
    thresh = fixed_thresh if fixed_thresh is not None else _otsu_threshold(arr)
    binary = Image.fromarray((arr > thresh).astype(np.uint8) * 255)

    data = pytesseract.image_to_data(
        binary, lang='eng',
        config='--psm 11 --oem 3',
        output_type=pytesseract.Output.DICT
    )

    col_texts = {}
    for i in range(len(data['text'])):
        text = data['text'][i].strip()
        conf = int(data['conf'][i])
        if not text or conf < 0:
            continue
        left = data['left'][i]
        width = data['width'][i]
        x_orig = (left + width / 2) / scale + x_start
        for ci in range(len(pipe_xs) - 1):
            if pipe_xs[ci] <= x_orig <= pipe_xs[ci + 1]:
                col_texts.setdefault(ci, []).append(text)
                break

    return col_texts


def _find_tgl_qta_rows(img, page_height_px):
    """
    在整页图像中动态定位所有 TGL/QTA 行的 y 坐标。
    策略：用 image_to_data 获取所有词的坐标，找到包含 '|' 和两位数字的行，
    按 top 坐标成对（TGL 行 + 紧随其后的 QTA 行）。
    返回 [(tgl_y1, tgl_y2, qta_y1, qta_y2), ...]
    """
    data = pytesseract.image_to_data(
        img, lang='ita+eng',
        config='--psm 6 --oem 3',
        output_type=pytesseract.Output.DICT
    )

    # 按 top 坐标聚类（±20px 算同一行）
    rows_by_top = {}
    for i in range(len(data['text'])):
        text = data['text'][i].strip()
        conf = int(data['conf'][i])
        top = data['top'][i]
        left = data['left'][i]
        if not text or conf < 0:
            continue
        key = None
        for k in rows_by_top:
            if abs(k - top) < 20:
                key = k
                break
        if key is None:
            key = top
            rows_by_top[key] = []
        rows_by_top[key].append({
            'text': text, 'left': left, 'top': top,
            'height': data['height'][i]
        })

    # 找候选行：包含 '|' 且有两位数字，跳过页眉（top < page_height_px*0.25）
    # 和页脚（top > page_height_px * 0.88）
    min_top = page_height_px * 0.25
    max_top = page_height_px * 0.88
    candidate_tops = []
    for top in sorted(rows_by_top.keys()):
        if top < min_top or top > max_top:
            continue
        row = rows_by_top[top]
        texts = [w['text'] for w in row]
        line = ' '.join(texts)
        # 必须包含竖线且有至少一个数字（TGL 行有两位尺码，QTA 行可能只有单位数量）
        if '|' in line and re.search(r'\d', line):
            avg_h = sum(w['height'] for w in row) / len(row)
            candidate_tops.append((top, avg_h))

    # 成对：按顺序两两配对（第 i 行是 TGL，第 i+1 行是 QTA）
    # 条件：相邻两行间距在 30~150px 之间
    pairs = []
    i = 0
    while i < len(candidate_tops) - 1:
        top1, h1 = candidate_tops[i]
        top2, h2 = candidate_tops[i + 1]
        gap = top2 - top1
        if 30 < gap < 150:
            # 行高固定为 gap 的 80%，确保不超过下一行
            row_h = min(int(gap * 0.8), 70)
            pairs.append((
                top1, top1 + row_h,
                top2, top2 + row_h
            ))
            i += 2  # 跳过已配对的 QTA 行
        else:
            i += 1  # 这行没有配对，跳过

    return pairs


def ocr_pdf_detailed(pdf_bytes):
    """
    OCR 解析图像型 PDF，返回明细数据（每个尺码一行）。

    核心算法：
    1. 用列像素均值检测 TGL/QTA 表格的竖线 x 坐标
    2. 对每行做 Otsu 二值化 + psm11 OCR
    3. 用每个词的 x 坐标匹配到对应列
    4. 用字符映射表修正字体导致的 OCR 误识别
    """
    all_products = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            img = page.to_image(resolution=400).original
            img_w, img_h = img.size

            # ── 1. 整页 OCR 找订单参考号 ──
            text_full = pytesseract.image_to_string(img, lang='ita+eng',
                                                     config='--psm 6 --oem 3')
            current_order_ref = ''
            for line in text_full.split('\n'):
                ref_match = re.search(
                    r'Rif\.Ord\.:\s*([\d/\s]+)\*+\s*Rif\.Vs\.Ord\.:\s*(\S+)',
                    line.strip())
                if ref_match:
                    current_order_ref = (f"{ref_match.group(1).strip()} "
                                         f"/ {ref_match.group(2).strip()}")

            # ── 2. 动态找 TGL/QTA 行的 y 坐标 ──
            tgl_qta_pairs = _find_tgl_qta_rows(img, img_h)
            if not tgl_qta_pairs:
                continue

            # ── 3. 检测竖线位置（用第一对 TGL 行）──
            first_tgl_y1, first_tgl_y2 = tgl_qta_pairs[0][0], tgl_qta_pairs[0][1]
            pipe_xs = _detect_pipe_xs(img, first_tgl_y1, first_tgl_y2)
            if len(pipe_xs) < 2:
                continue

            # ── 4. 逐商品：在 TGL 行上方区域找商品行，再解析 TGL/QTA ──
            for tgl_y1, tgl_y2, qta_y1, qta_y2 in tgl_qta_pairs:
                # 商品行在 TGL 行上方约 80~150px
                prod_search_y1 = max(0, tgl_y1 - 160)
                prod_search_y2 = tgl_y1 - 5
                prod_region = img.crop((0, prod_search_y1, img_w, prod_search_y2))
                prod_text = pytesseract.image_to_string(
                    prod_region, lang='ita+eng', config='--psm 6 --oem 3')

                article_code, suffix, product_name, price = None, None, '', 0.0
                for line in prod_text.split('\n'):
                    line = line.strip()
                    if '64031900' not in line or 'PA' not in line:
                        continue
                    ac, sf = extract_article_code(line)
                    if not ac:
                        continue
                    pm = re.search(r'PA\s+[\d,]+\s+([\d,.]+)', line)
                    if not pm:
                        continue
                    article_code = ac
                    suffix = sf
                    product_name = extract_product_name(line, sf)
                    price = parse_italian_number(pm.group(1))
                    break

                if not article_code:
                    continue

                # 解析 TGL/QTA 列
                # TGL 行用 Otsu 自适应阈值；QTA 行用固定阈值 180（经验证效果更好）
                tgl_cols = _ocr_row_by_col(img, tgl_y1, tgl_y2, pipe_xs)
                qta_cols = _ocr_row_by_col(img, qta_y1, qta_y2, pipe_xs,
                                            fixed_thresh=180)

                all_cols = sorted(set(list(tgl_cols.keys()) + list(qta_cols.keys())))
                for col in all_cols:
                    tgl_raw = ' '.join(tgl_cols.get(col, []))
                    qta_raw = ' '.join(qta_cols.get(col, []))
                    size = _fix_size(tgl_raw)
                    qty = _fix_qty(qta_raw)
                    if not size or not qty:
                        continue
                    all_products.append({
                        'articleCode': article_code,
                        'description': product_name,
                        'size': size,
                        'qty': qty,
                        'price': f'{price:.2f}',
                        'discountedPrice': f'{price * 0.97:.2f}',
                        'page': page_num,
                        'orderRef': current_order_ref,
                    })

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
    # threaded=True 允许并发处理多个请求（OCR 耗时长，需要多线程避免阻塞）
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
