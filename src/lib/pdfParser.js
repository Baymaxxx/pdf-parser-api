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
 * 将所有行合并，然后按常见分隔符重新切割
 */
function normalizeLines(rawLines) {
  // 合并所有文本，然后按空白行或明显的段落重新分割
  const result = [];
  for (const line of rawLines) {
    // 按多个空格分割（PDF 中常见的列分隔）
    const parts = line.split(/\s{2,}/);
    for (const p of parts) {
      const t = p.trim();
      if (t) result.push(t);
    }
  }
  return result;
}

/**
 * 尝试从文本行中识别 CRISPI Invoice 格式数据
 * 支持多种变体格式
 */
function parseInvoiceLines(lines) {
  const results = [];
  const normalized = normalizeLines(lines);

  // 打印调试信息到控制台
  console.log('=== PDF 提取的文本行 ===');
  normalized.forEach((l, i) => console.log(`[${i}] ${l}`));
  console.log('=== 共', normalized.length, '行 ===');

  // 策略1：查找 货号(字母+数字) + 尺码 + 数量 + 价格 的模式
  for (let i = 0; i < normalized.length; i++) {
    const line = normalized[i];

    // 匹配货号模式：字母前缀 + 4-6位数字，或纯8-10位数字
    const codePatterns = [
      // TH5660 0115 格式（带空格分隔的前缀和后缀）
      /\b([A-Z]{1,4})(\d{4,6})\s+(\d{4})\b/,
      // 56600115 格式（纯数字货号）
      /\b(\d{8,10})\b/,
      // TH56600115 格式（连续字母+数字）
      /\b([A-Z]{1,4})(\d{8,10})\b/,
    ];

    let articleCode = null;
    let matchedText = '';

    for (const pattern of codePatterns) {
      const m = line.match(pattern);
      if (m) {
        if (pattern === codePatterns[0]) {
          articleCode = buildArticleCode(m[1] + m[2], m[3]);
          matchedText = m[0];
        } else if (pattern === codePatterns[1]) {
          articleCode = m[1];
          matchedText = m[0];
        } else {
          articleCode = m[1] + m[2];
          matchedText = m[0];
        }
        break;
      }
    }

    if (!articleCode) continue;

    // 提取品名（去除货号和价格后的文字部分）
    const priceMatch = line.match(/(\d{1,4}[.,]\d{2})\s*€?\s*$/);
    const price = priceMatch ? parseItalianNumber(priceMatch[1]) : 0;
    const description = line
      .replace(matchedText, '')
      .replace(priceMatch ? priceMatch[0] : '', '')
      .replace(/\s+/g, ' ')
      .trim() || articleCode;

    // 查找 TGL / QTA 行（向后查找5行）
    let tglLine = '', qtaLine = '';
    let tglLineIdx = -1, qtaLineIdx = -1;

    for (let j = i + 1; j < Math.min(i + 8, normalized.length); j++) {
      const ln = normalized[j];
      if (/\bTGL\b/i.test(ln) && !tglLine) {
        tglLine = ln;
        tglLineIdx = j;
      }
      if (/\bQTA\b/i.test(ln) && !qtaLine) {
        qtaLine = ln;
        qtaLineIdx = j;
      }
      if (tglLine && qtaLine) break;
    }

    // 从 TGL 和 QTA 行提取尺码和数量
    if (tglLine && qtaLine) {
      const sizeTokens = tglLine.replace(/TGL/gi, '').trim().match(/[\d]+(?:[.,][\d]+)?/g) || [];
      const qtyTokens = qtaLine.replace(/QTA/gi, '').trim().match(/[\d]+(?:[.,][\d]+)?/g) || [];
      const len = Math.min(sizeTokens.length, qtyTokens.length);

      for (let k = 0; k < len; k++) {
        const qty = parseFloat(qtyTokens[k]);
        if (qty > 0) {
          results.push({
            articleCode,
            description,
            size: sizeTokens[k],
            qty: qtyTokens[k],
            price: price > 0 ? price.toFixed(2) : '0.00',
          });
        }
      }

      // 跳过已处理的 TGL/QTA 行
      if (qtaLineIdx > 0) i = qtaLineIdx;
      continue;
    }

    // 策略2：在同一行或相邻行中查找数量信息（简化格式）
    // 查找：货号 + 品名 + 尺码 + 数量 + 单价 全在一行的格式
    const inlineMatch = line.match(/(\d{2,3}(?:\.\d)?)\s+(\d{1,3})\s+(\d{1,4}[.,]\d{2})/);
    if (inlineMatch) {
      const qty = parseFloat(inlineMatch[2]);
      if (qty > 0) {
        results.push({
          articleCode,
          description,
          size: inlineMatch[1],
          qty: inlineMatch[2],
          price: parseItalianNumber(inlineMatch[3]).toFixed(2),
        });
      }
    }
  }

  return results;
}

/**
 * 主入口：解析 CRISPI Invoice PDF
 * @returns {{ data: Array, rawText: string }}
 */
export async function parsePdfInvoice(file) {
  let lines = [];
  let buffer;

  try {
    buffer = await readFileAsArrayBuffer(file);
    lines = extractTextFromPdfBytes(buffer);
  } catch (e) {
    throw new Error('文件读取失败：' + e.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error('未能从 PDF 中提取到文本内容，请确认文件格式正确（不支持纯扫描图片 PDF）');
  }

  const rawText = lines.join('\n');
  const data = parseInvoiceLines(lines);

  return { data, rawText };
}
