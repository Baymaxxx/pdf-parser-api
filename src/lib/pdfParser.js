import { buildArticleCode, parseItalianNumber } from './invoiceUtils';
import { extractTextFromPdfBytes } from './pdfRawParser';

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 解析CRISPI Invoice格式
 * 每个商品由3行组成：
 * 1. 商品行: 货号前缀(如TH5660) 后缀(如0115) 描述 单价
 * 2. TGL行: TGL 37 38 39 40 41
 * 3. QTA行: QTA  2  3  4  3  2
 */
function parseInvoiceLines(lines) {
  const results = [];

  console.log('=== 开始解析，共', lines.length, '行 ===');
  lines.forEach((l, i) => console.log(`[${i}] ${l}`));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配货号格式：字母前缀+数字(如TH5660) 空格 4位后缀(如0115)
    // 或者 Articolo字段后跟货号
    const articleMatch =
      line.match(/\b([A-Z]{1,3})(\d{3,6})\s+(\d{4})\b/) ||
      line.match(/\b([A-Z]{1,3})(\d{3,6})(\d{4})\b/);

    if (!articleMatch) continue;

    // 构建货号：提取前缀数字部分拼接后缀
    const prefixLetters = articleMatch[1];
    const prefixNums = articleMatch[2];
    const suffix = articleMatch[3];
    const articleCode = buildArticleCode(prefixLetters + prefixNums, suffix);

    // 提取单价（意大利格式：如 89,90 或 1.234,56）
    const priceMatch = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?\s*$/);
    const price = priceMatch ? parseItalianNumber(priceMatch[1]) : 0;

    // 提取描述（去掉货号和价格）
    let description = line
      .replace(articleMatch[0], '')
      .replace(priceMatch ? priceMatch[0] : '', '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!description) description = articleCode;

    // 向后查找TGL行和QTA行（最多10行内）
    let tglLine = '', qtaLine = '';
    let qtaIdx = -1;

    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const ln = lines[j];
      if (!tglLine && /\bTGL\b/i.test(ln)) tglLine = ln;
      if (!qtaLine && /\bQTA\b/i.test(ln)) { qtaLine = ln; qtaIdx = j; }
      if (tglLine && qtaLine) break;
    }

    if (!tglLine || !qtaLine) continue;

    // 提取尺码列表（TGL后面的数字）
    const sizes = tglLine.replace(/\bTGL\b/gi, '').trim().match(/\d+(?:[,.]\d+)?/g) || [];
    // 提取数量列表（QTA后面的数字）
    const qtys = qtaLine.replace(/\bQTA\b/gi, '').trim().match(/\d+(?:[,.]\d+)?/g) || [];

    const len = Math.min(sizes.length, qtys.length);
    for (let k = 0; k < len; k++) {
      const qty = parseFloat(qtys[k].replace(',', '.'));
      if (qty > 0) {
        results.push({
          articleCode,
          description,
          size: sizes[k],
          qty: String(qty),
          price: price > 0 ? price.toFixed(2) : '0.00',
        });
      }
    }

    if (qtaIdx > 0) i = qtaIdx;
  }

  console.log('=== 解析完成，找到', results.length, '条记录 ===');
  return results;
}

/**
 * 主入口：解析CRISPI Invoice PDF
 * @param {File} file
 * @param {Function} onProgress
 * @returns {Promise<{ data: Array, rawText: string }>}
 */
export async function parsePdfInvoice(file, onProgress) {
  let buffer;
  try {
    buffer = await readFileAsArrayBuffer(file);
  } catch (e) {
    throw new Error('文件读取失败：' + e.message);
  }

  let lines;
  try {
    lines = await extractTextFromPdfBytes(buffer, onProgress);
  } catch (e) {
    throw new Error('PDF解析失败：' + e.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error('未能从PDF中提取到文本内容');
  }

  const rawText = lines.join('\n');
  const data = parseInvoiceLines(lines);

  return { data, rawText };
}
