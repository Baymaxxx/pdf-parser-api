import { buildArticleCode, parseItalianNumber } from './invoiceUtils';
import * as pdfjsLib from 'pdfjs-dist';

// 配置 PDF.js worker
// 使用本地worker文件而不是CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).href;

// 提取PDF所有页面的文本行
async function extractTextLines(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // 按Y坐标分组,合并同行文字
    const yMap = new Map();
    for (const item of textContent.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!yMap.has(y)) yMap.set(y, []);
      yMap.get(y).push({ x: item.transform[4], text: item.str });
    }

    // 按Y从大到小(页面从上到下),每行按X排序拼接
    const sortedYs = Array.from(yMap.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const line = yMap.get(y).sort((a, b) => a.x - b.x).map(i => i.text).join(' ');
      allLines.push(line.trim());
    }
  }
  return allLines;
}

// 尝试OCR识别(当文本提取不到有效内容时)
async function extractTextByOCR(file) {
  const Tesseract = await import('tesseract.js');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageData = canvas.toDataURL('image/png');
    const { data: { text } } = await Tesseract.default.recognize(imageData, 'ita+eng');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    allLines.push(...lines);
  }
  return allLines;
}

// 解析行数据,提取商品信息
function parseInvoiceLines(lines) {
  const results = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 匹配商品描述行:含有类似TH5660 或字母+数字 形式的 Articolo 字段
    // 格式示例: "TH5660 0115BOOT HIKING ...  € 89,90"
    const articleMatch = line.match(/\b([A-Z]{1,4}\d{4,6})\s+(\d{4})\b/);
    if (articleMatch) {
      const prefix = articleMatch[1];
      const suffix = articleMatch[2];
      const articleCode = buildArticleCode(prefix, suffix);
      const description = line.replace(articleMatch[0], '').replace(/€?\s*[\d.,]+\s*$/, '').trim();

      // 提取单价(意大利格式)
      const priceMatch = line.match(/[\d]{1,4}[.,]\d{2}(?:\s*€)?$/);
      const price = priceMatch ? parseItalianNumber(priceMatch[0].replace('€', '').trim()) : 0;

      // 查找后续 TGL 行和 QTA 行
      let tglLine = '', qtaLine = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if(/TGL|tgl/i.test(lines[j])) { tglLine = lines[j]; }
        if (/QTA|qta/i.test(lines[j])) { qtaLine = lines[j]; }if (tglLine && qtaLine) break;
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
        }i +=3;continue;
      }
    }
    i++;
  }
  return results;
}

// 解析 TGL/QTA 行,提取数值列表
function parseSizeQtyLine(line, type) {
  if (!line) return [];
  // 移除标签,提取所有数字/尺码值
  const cleaned = line.replace(new RegExp(type, 'gi'), '').trim();
  //匹配数字(含小数)
  const tokens = cleaned.match(/\d+(?:[.,]\d+)?/g) || [];
  return tokens;
}

// 主入口
export async function parsePdfInvoice(file) {
  let lines = await extractTextLines(file);
  const hasContent = lines.some(l => /[A-Z]{1,4}\d{4,6}/.test(l));

  if (!hasContent) {
    // 文本提取无效,尝试OCR
    lines = await extractTextByOCR(file);
  }

  const data = parseInvoiceLines(lines);

  if (data.length === 0) {
    throw new Error('未能识别到商品数据,请确认文件为CRISPI Invoice 格式');
  }
  return data;
}
