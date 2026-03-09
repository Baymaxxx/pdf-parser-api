/**
 * PDF文本提取 + OCR双模式解析器
 * 1. 优先用pdfjs提取文本层
 * 2. 如果文本层缺少数字数据，则渲染页面为图片，用tesseract.js OCR识别
 */

let pdfjsLib = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('pdfjs-script');
    if (existing && window.pdfjsLib) {
      pdfjsLib = window.pdfjsLib;
      return resolve(pdfjsLib);
    }
    if (existing) {
      const check = setInterval(() => {
        if (window.pdfjsLib) { clearInterval(check); pdfjsLib = window.pdfjsLib; resolve(pdfjsLib); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('pdfjs加载超时')); }, 15000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'pdfjs-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib = window.pdfjsLib;
        resolve(pdfjsLib);
      } else {
        reject(new Error('pdfjs加载后window.pdfjsLib不存在'));
      }
    };
    script.onerror = () => reject(new Error('pdfjs CDN加载失败'));
    document.head.appendChild(script);
  });
}

/** 从PDF页面提取文本行（按Y坐标分组） */
async function extractTextLinesFromPage(page) {
  const textContent = await page.getTextContent();
  const itemsByY = new Map();
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    if (!itemsByY.has(y)) itemsByY.set(y, []);
    itemsByY.get(y).push({ x: item.transform[4], str: item.str });
  }
  const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);
  return sortedYs.map(y => {
    const items = itemsByY.get(y).sort((a, b) => a.x - b.x);
    return items.map(i => i.str).join(' ').trim();
  }).filter(Boolean);
}

/** 将PDF页面渲染为canvas，返回ImageData用于OCR */
async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** 使用tesseract.js对canvas进行OCR */
async function ocrCanvas(canvas, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng+ita', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  // 针对发票数字识别优化
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/:- %€\n ',
  });
  const { data: { text } } = await worker.recognize(canvas);
  await worker.terminate();
  return text;
}

/** 判断文本行是否包含有效的商品数字数据 */
function hasProductData(lines) {
  // 寻找包含 TGL 或 QTA 或 Articolo数字格式的行
  return lines.some(l => /\bTGL\b/i.test(l) || /\bQTA\b/i.test(l) || /\b\d{4,}\b/.test(l));
}

/**
 * 主函数：从PDF ArrayBuffer提取文本
 * @param {ArrayBuffer} buffer
 * @param {Function} onProgress - 进度回调 (message, percent)
 * @returns {Promise<string[]>}
 */
export async function extractTextFromPdfBytes(buffer, onProgress) {
  const pdfjs = await loadPdfjs();
  onProgress?.('正在加载PDF...', 10);

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  let allLines = [];

  // 第一步：提取所有页面的文本层
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const lines = await extractTextLinesFromPage(page);
    allLines = allLines.concat(lines);
  }

  onProgress?.('检查文本内容...', 20);
  console.log('文本层提取结果:', allLines.length, '行');
  console.log('文本预览:', allLines.slice(0, 10));

  // 第二步：判断是否需要OCR
  if (hasProductData(allLines)) {
    console.log('文本层包含商品数据，无需OCR');
    onProgress?.('文本提取完成', 100);
    return allLines;
  }

  // 第三步：文本层不含商品数据，启用OCR
  console.log('文本层缺少商品数据，启动OCR识别...');
  onProgress?.('文本层无数据，启动OCR识别（可能需要1-2分钟）...', 25);

  const ocrLines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(`正在OCR识别第${pageNum}/${pdf.numPages}页...`, 25 + Math.round((pageNum - 1) / pdf.numPages * 70));
    const page = await pdf.getPage(pageNum);
    const canvas = await renderPageToCanvas(page, 2.5);
    const ocrText = await ocrCanvas(canvas, (pct) => {
      const base = 25 + Math.round((pageNum - 1) / pdf.numPages * 70);
      onProgress?.(`OCR第${pageNum}页: ${pct}%`, base + Math.round(pct / pdf.numPages * 0.7));
    });
    const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
    ocrLines.push(...lines);
    console.log(`第${pageNum}页OCR结果:`, lines.length, '行');
  }

  onProgress?.('OCR完成', 100);
  console.log('OCR总行数:', ocrLines.length);
  return ocrLines.length > 0 ? ocrLines : allLines;
}
