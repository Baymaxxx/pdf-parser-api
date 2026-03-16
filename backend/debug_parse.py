#!/usr/bin/env python3
"""
调试 PDF 解析脚本
用于分析 PDF 解析结果与预期的差异
"""
import sys
import requests
import json
from collections import defaultdict

def parse_pdf_api(pdf_path):
    """调用 API 解析 PDF"""
    url = "http://localhost:3001/api/parse-pdf"

    with open(pdf_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(url, files=files)

    if response.status_code != 200:
        print(f"API 错误: {response.status_code}")
        print(response.text)
        return None

    return response.json()

def analyze_results(data):
    """分析解析结果"""
    print(f"=== 解析结果分析 ===")
    print(f"总记录数: {data['count']}\n")

    # 按货号汇总
    summary = defaultdict(lambda: {'qty': 0, 'items': []})

    for item in data['data']:
        code = item['articleCode']
        qty = int(item['qty'])
        summary[code]['qty'] += qty
        summary[code]['items'].append(item)

    print(f"=== 按货号汇总 ===")
    print(f"{'货号':<15} {'数量':>8} {'记录数':>8} {'单价':>10}")
    print("-" * 50)

    total_qty = 0
    for code in sorted(summary.keys()):
        info = summary[code]
        qty = info['qty']
        count = len(info['items'])
        price = info['items'][0]['price']
        total_qty += qty
        print(f"{code:<15} {qty:>8} {count:>8} {price:>10}")

    print("-" * 50)
    print(f"{'总计':<15} {total_qty:>8} {len(data['data']):>8}")

    # 显示详细记录
    print(f"\n\n=== 详细记录 ===")
    for code in sorted(summary.keys()):
        items = summary[code]['items']
        if len(items) > 1:
            print(f"\n货号: {code} (共 {len(items)} 条记录)")
            for i, item in enumerate(items, 1):
                print(f"  {i}. 数量:{item['qty']:>4} 单价:{item['price']} 描述:{item['description']}")

    return summary

def compare_with_expected(summary, expected):
    """对比预期结果"""
    print(f"\n\n=== 对比预期结果 ===")
    print(f"{'货号':<15} {'实际':>8} {'预期':>8} {'差异':>8} {'状态'}")
    print("-" * 60)

    all_codes = set(summary.keys()) | set(expected.keys())

    for code in sorted(all_codes):
        actual = summary.get(code, {}).get('qty', 0)
        expect = expected.get(code, 0)
        diff = actual - expect
        status = "✅" if diff == 0 else "❌"
        print(f"{code:<15} {actual:>8} {expect:>8} {diff:>8} {status}")

    total_actual = sum(s['qty'] for s in summary.values())
    total_expect = sum(expected.values())
    total_diff = total_actual - total_expect

    print("-" * 60)
    print(f"{'总计':<15} {total_actual:>8} {total_expect:>8} {total_diff:>8}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python3 debug_parse.py <pdf文件路径>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"解析文件: {pdf_path}\n")

    # 调用 API
    result = parse_pdf_api(pdf_path)
    if not result:
        sys.exit(1)

    # 分析结果
    summary = analyze_results(result)

    # 预期结果（从 Excel 得出）
    expected = {
        '49803500': 3,
        '50242412': 1,
        '50242460': 15,
        '50243032': 17,
        '56001500': 2,
        '56009900': 1,
        '56600106': 2,
        '56600115': 39,
        '56602460': 5,
        '56603032': 10,
        '57253200': 1,
        '62300100': 12,
        '62303600': 3,
        '62309900': 51,
    }

    # 对比
    compare_with_expected(summary, expected)
