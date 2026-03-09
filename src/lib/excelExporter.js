import * as XLSX from 'xlsx';

/**
 * 将解析数据导出为 Excel 文件
 * @param {Array} data - 解析后的商品数据
 * @param {string} sourceFileName - 原始文件名（用于命名导出文件）
 */
export function exportToExcel(data, sourceFileName = 'invoice') {
  const rows = data.map((item, index) => ({
    '序号': index + 1,
    '货号': item.articleCode,
    '品名': item.description,
    '尺码': item.size,
    '数量': Number(item.qty),
    '单价(€)': Number(item.price),
    '金额(€)': (Number(item.qty) * Number(item.price)).toFixed(2),
  }));

  // 添加合计行
  const totalQty = data.reduce((sum, r) => sum + Number(r.qty), 0);
  const totalAmt = data.reduce((sum, r) => sum + Number(r.qty) * Number(r.price), 0);
  rows.push({
    '序号': '',
    '货号': '',
    '品名': '合计',
    '尺码': '',
    '数量': totalQty,
    '单价(€)': '',
    '金额(€)': totalAmt.toFixed(2),
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // 设置列宽
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 8 },
    { wch: 8 }, { wch: 10 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购清单');

  const baseName = sourceFileName.replace(/\.pdf$/i, '');
  XLSX.writeFile(wb, `${baseName}_解析结果.xlsx`);
}
