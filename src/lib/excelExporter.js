import * as XLSX from 'xlsx';

/**
 * 从8位货号提取4微编码（前4位数字）
 */
function get4Wei(articleCode) {
  const num = articleCode.replace(/\D/g, '');
  return num.substring(0, 4);
}

/**
 * 从8位货号提取颜色编号（后4位，前面加8）
 */
function getColorCode(articleCode) {
  const num = articleCode.replace(/\D/g, '');
  return '8' + num.substring(4);
}

/**
 * 报关用名称映射（去掉颜色后缀）
 */
function getCustomsName(description) {
  const map = {
    'MONACO LOW GTX': 'MONACO LOW GTX',
    'MONACO LEEDS GTX': 'MONACO LEEDS GTX',
    'MONACO GTX': 'MONACO GTX',
    'MONACO/TINN GTX': 'MONACO/TINN GTX',
    'MONACO TINN GTX': 'MONACO/TINN GTX',
    'MONACO PREMIUM': 'MONACO PREMIUM GTX',
    'MONACO PREMIUM URBN GTX': 'MONACO PREMIUM GTX',
    'PERFETTA GTX': 'PERFETTA GTX',
  };
  const upper = (description || '').toUpperCase();
  for (const [key, val] of Object.entries(map)) {
    if (upper.includes(key)) return val;
  }
  return description || '';
}

/**
 * 将解析数据导出为 Excel 文件（3个sheet，匹配参考格式）
 * @param {Array} data - 解析后的商品数据（来自API，每条含 articleCode, description, qty, price, size）
 * @param {string} sourceFileName - 原始文件名
 */
export function exportToExcel(data, sourceFileName = 'invoice') {
  const wb = XLSX.utils.book_new();

  // ========== Sheet 1: 明细表 ==========
  const detailHeaders = ['货号', '4微', '报关用', '货品名称', '颜色编号', '内长', '尺码', '数量', '单价', '折后单价', '含运费单价', '总价', '含运费总价'];
  const detailData = [detailHeaders];

  data.forEach(item => {
    const articleCode = item.articleCode;
    const wei4 = get4Wei(articleCode);
    const customsName = getCustomsName(item.description);
    const colorCode = getColorCode(articleCode);
    const size = item.size === '-' ? '' : item.size;
    const qty = Number(item.qty);
    const price = Number(item.price);
    const discountPrice = Math.round(price * 0.97 * 10000) / 10000; // 折后单价 = 单价 * 0.97
    const total = Math.round(qty * discountPrice * 10000) / 10000;

    detailData.push([
      Number(articleCode) || articleCode,
      Number(wei4) || wei4,
      customsName,
      item.description,
      colorCode,
      0,        // 内长
      size ? Number(size) : '',
      qty,
      price,
      discountPrice,
      '',       // 含运费单价（需要运费数据才能算）
      total,
      '',       // 含运费总价
    ]);
  });

  // 添加汇总行
  const totalQty = data.reduce((sum, r) => sum + Number(r.qty), 0);
  const totalAmount = detailData.slice(1).reduce((sum, row) => sum + (row[11] || 0), 0);
  const summaryRowIdx = detailData.length + 1; // Excel行号（1-indexed）

  detailData.push([
    '合计', '', '', '', '', '', '',
    totalQty,
    '',
    '',
    '',
    totalAmount,
    '',
  ]);

  const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
  wsDetail['!cols'] = [
    { wch: 12 },  // 货号
    { wch: 6 },   // 4微
    { wch: 22 },  // 报关用
    { wch: 30 },  // 货品名称
    { wch: 10 },  // 颜色编号
    { wch: 6 },   // 内长
    { wch: 6 },   // 尺码
    { wch: 6 },   // 数量
    { wch: 8 },   // 单价
    { wch: 10 },  // 折后单价
    { wch: 12 },  // 含运费单价
    { wch: 12 },  // 总价
    { wch: 12 },  // 含运费总价
  ];

  // ========== Sheet 2: 汇总表（简版） ==========
  // 按4微分组汇总
  const groupMap = new Map();
  data.forEach(item => {
    const wei4 = get4Wei(item.articleCode);
    const customsName = getCustomsName(item.description);
    const price = Number(item.price);
    const discountPrice = Math.round(price * 0.97 * 10000) / 10000;
    const qty = Number(item.qty);

    if (!groupMap.has(wei4)) {
      groupMap.set(wei4, { wei4, customsName, discountPrice, totalQty: 0, totalAmount: 0 });
    }
    const g = groupMap.get(wei4);
    g.totalQty += qty;
    g.totalAmount += qty * discountPrice;
    // 用加权平均价格
    g.discountPrice = Math.round((g.totalAmount / g.totalQty) * 1000) / 1000;
  });

  const summaryHeaders = ['4微', '折后单价', '报关用', '求和项:数量', '求和项:总价'];
  const summaryData = [summaryHeaders];

  let grandQty = 0;
  let grandTotal = 0;
  for (const [, g] of groupMap) {
    const total = Math.round(g.totalAmount * 10000) / 10000;
    summaryData.push([
      Number(g.wei4),
      g.discountPrice,
      g.customsName,
      g.totalQty,
      total,
    ]);
    grandQty += g.totalQty;
    grandTotal += total;
  }
  summaryData.push(['总计', '', '', grandQty, Math.round(grandTotal * 10000) / 10000]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [
    { wch: 8 },   // 4微
    { wch: 10 },  // 折后单价
    { wch: 22 },  // 报关用
    { wch: 12 },  // 数量
    { wch: 14 },  // 总价
  ];

  // ========== Sheet 3: 汇总表（含运费版） ==========
  // 左侧：不含运费汇总，右侧：含运费汇总
  const sheet3Headers = ['4微', '折后单价', '报关用', '求和项:数量', '求和项:总价', '', '货号', '报关用', '折后单价', '求和项:数量', '求和项:总价', '含运费单价', '含运费总价'];
  const sheet3Data = [sheet3Headers];

  const groups = Array.from(groupMap.values());
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const total = Math.round(g.totalAmount * 10000) / 10000;
    sheet3Data.push([
      Number(g.wei4),
      g.discountPrice,
      g.customsName,
      g.totalQty,
      total,
      '',  // 空列分隔
      Number(g.wei4),
      g.customsName,
      g.discountPrice,
      g.totalQty,
      total,
      '',  // 含运费单价（需运费数据）
      '',  // 含运费总价
    ]);
  }
  // 汇总行
  sheet3Data.push([
    '总计', '', '', grandQty, Math.round(grandTotal * 10000) / 10000,
    '', '', '总计', '', grandQty, Math.round(grandTotal * 10000) / 10000, '', '',
  ]);

  const wsSheet3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  wsSheet3['!cols'] = [
    { wch: 8 },   // 4微
    { wch: 10 },  // 折后单价
    { wch: 22 },  // 报关用
    { wch: 8 },   // 数量
    { wch: 14 },  // 总价
    { wch: 2 },   // 分隔
    { wch: 8 },   // 货号
    { wch: 22 },  // 报关用
    { wch: 10 },  // 折后单价
    { wch: 8 },   // 数量
    { wch: 14 },  // 总价
    { wch: 12 },  // 含运费单价
    { wch: 14 },  // 含运费总价
  ];

  // 添加 sheets 到 workbook
  const baseName = sourceFileName.replace(/\.pdf$/i, '').replace(/^[\d\-_\s]+/, '');
  const detailSheetName = baseName || '采购明细';

  XLSX.utils.book_append_sheet(wb, wsDetail, detailSheetName);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Sheet1');
  XLSX.utils.book_append_sheet(wb, wsSheet3, 'Sheet3');

  const outputName = sourceFileName.replace(/\.pdf$/i, '');
  XLSX.writeFile(wb, `采购单${outputName}.xlsx`);
}
