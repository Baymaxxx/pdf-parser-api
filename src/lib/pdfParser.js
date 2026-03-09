import { buildArticleCode, parseItalianNumber } from './invoiceUtils';
import { extractTextFromPdfBytes } from './pdfRawParser';

/**
 * 从 File 对象读取 ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 解析 TGL/QTA 行，提取数值列表
 */
function parseSizeQtyLine(line, type) {
  if (!line) return [];
  const cleaned = line.replace(new RegExp(type, 'gi'), '').trim();
  const tokens = cleaned.match(/\d+(?:[.,]\d+)?/g) || [];
  return tokens;
}

/**
 * 解析行数据，提取商品信息
 */
function parseInvoiceLines(lines) {
  const results = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 匹配商品描述行：含有类似 TH5660 或字母+数字形式的 Articolo 字段
    const articleMatch = line.match(/\b([A-Z]{1,4}\d{4,6})\s+(\d{4})\b/);
    if (articleMatch) {
      const prefix = articleMatch[1];
      const suffix = articleMatch[2];
      const articleCode = buildArticleCode(prefix, suffix);
      const description = line.replace(articleMatch[0], '').replace(/€?\s*[\d.,]+\s*$/, '').trim();

      // 提取单价（意大利格式）
      const priceMatch = line.match(/[\d]{1,4}[.,]\d{2}(?:\s*€)?$/);
      const price = priceMatch ? parseItalianNumber(priceMatch[0].replace('€', '').trim()) : 0;

      // 查找后续 TGL 行和 QTA 行
      let tglLine = '', qtaLine = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/TGL|tgl/i.test(lines[j])) { tglLine = lines[j]; }
        if (/QTA|qta/i.test(lines[j])) { qtaLine = lines[j]; }
        if (tglLine && qtaLine) break;
      }

      const sizes = parseSizeQtyLine(tglLine, 'TGL');
      const qtys = parseSizeQtyLine(qtaLine, 'QTA');

      if (sizes.length > 0 && qtys.length > 0) {
        const len = Math.min(sizes.length, qtys.length);
        for (let k = 0; k < len; k++) {
          if (parseFloat(qtys[k]) > 0) {
            results.push({
              articleCode,
              description: description || prefix,
              size: sizes[k],
              qty: qtys[k],
              price: price.toFixed(2),
            });
          }
        }
        i += 3;
        continue;
      }
    }
    i++;
  }
  return results;
}

/**
 * 主入口：解析 CRISPI Invoice PDF
 */
export async function parsePdfInvoice(file) {
  let lines = [];

  try {
    const buffer = await readFileAsArrayBuffer(file);
    lines = extractTextFromPdfBytes(buffer);
  } catch (e) {
    throw new Error('文件读取失败：' + e.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error('未能从 PDF 中提取到文本内容，请确认文件格式正确');
  }

  const data = parseInvoiceLines(lines);

  if (data.length === 0) {
    throw new Error('未能识别到商品数据，请确认文件为 CRISPI Invoice 格式');
  }

  return data;
}
