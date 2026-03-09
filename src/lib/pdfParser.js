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

function normalizeLines(rawLines) {
  const result = [];
  for (const line of rawLines) {
    const parts = line.split(/\s{2,}/);
    for (const p of parts) {
      const t = p.trim();
      if (t) result.push(t);
    }
  }
  return result;
}

function parseInvoiceLines(lines) {
  const results = [];
  const normalized = normalizeLines(lines);

  console.log('=== PDF 提取的文本行 ===');
  normalized.forEach((l, i) => console.log(`[${i}] ${l}`));
  console.log('=== 共', normalized.length, '行 ===');

  for (let i = 0; i < normalized.length; i++) {
    const line = normalized[i];

    const codePatterns = [
      /\b([A-Z]{1,4})(\d{4,6})\s+(\d{4})\b/,
      /\b(\d{8,10})\b/,
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

    const priceMatch = line.match(/(\d{1,4}[.,]\d{2})\s*€?\s*$/);
    const price = priceMatch ? parseItalianNumber(priceMatch[1]) : 0;
    const description = line
      .replace(matchedText, '')
      .replace(priceMatch ? priceMatch[0] : '', '')
      .replace(/\s+/g, ' ')
      .trim() || articleCode;

    let tglLine = '', qtaLine = '';
    let qtaLineIdx = -1;

    for (let j = i + 1; j < Math.min(i + 8, normalized.length); j++) {
      const ln = normalized[j];
      if (/\bTGL\b/i.test(ln) && !tglLine) tglLine = ln;
      if (/\bQTA\b/i.test(ln) && !qtaLine) {
        qtaLine = ln;
        qtaLineIdx = j;
      }
      if (tglLine && qtaLine) break;
    }

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

      if (qtaLineIdx > 0) i = qtaLineIdx;
      continue;
    }

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
 * @returns {Promise<{ data: Array, rawText: string }>}
 */
export async function parsePdfInvoice(file) {
  let lines = [];
  let buffer;

  try {
    buffer = await readFileAsArrayBuffer(file);
    // extractTextFromPdfBytes 现在是异步的
    lines = await extractTextFromPdfBytes(buffer);
  } catch (e) {
    throw new Error('PDF 解析失败：' + e.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error('未能从 PDF 中提取到文本内容，请确认文件格式正确（不支持纯扫描图片 PDF）');
  }

  const rawText = lines.join('\n');
  const data = parseInvoiceLines(lines);

  return { data, rawText };
}
