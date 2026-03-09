/**
 * 使用 pdfjs-dist（已安装）通过 importScripts/动态加载方式解析 PDF
 * 采用 pdfjs-dist 的标准 ES 模块导入，禁用 worker（主线程解析）
 */

let pdfjsLib = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;

  // 直接从 CDN 加载 pdfjs，避免 vite 打包问题
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('pdfjs-script');
    if (existing) {
      // 已经在加载中，等待
      const check = setInterval(() => {
        if (window.pdfjsLib) {
          clearInterval(check);
          pdfjsLib = window.pdfjsLib;
          resolve(pdfjsLib);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('pdfjs 加载超时')); }, 10000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'pdfjs-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        // 禁用 worker，在主线程中运行
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        pdfjsLib = window.pdfjsLib;
        resolve(pdfjsLib);
      } else {
        reject(new Error('pdfjs 加载后 window.pdfjsLib 不存在'));
      }
    };
    script.onerror = () => reject(new Error('pdfjs CDN 加载失败'));
    document.head.appendChild(script);
  });
}

/**
 * 从 PDF ArrayBuffer 中提取所有文本行
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string[]>}
 */
export async function extractTextFromPdfBytes(buffer) {
  const pdfjs = await loadPdfjs();

  // 使用假 worker 路径，触发 pdfjs 使用主线程 fake worker
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // 按 Y 坐标分组，同一行的文本合并
    const itemsByY = new Map();
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]); // Y 坐标取整
      if (!itemsByY.has(y)) itemsByY.set(y, []);
      itemsByY.get(y).push({ x: item.transform[4], str: item.str });
    }

    // 按 Y 坐标降序排列（PDF 坐标系从底部开始，大Y值在上方）
    const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);

    for (const y of sortedYs) {
      const items = itemsByY.get(y).sort((a, b) => a.x - b.x);
      const lineText = items.map(i => i.str).join(' ').trim();
      if (lineText) allLines.push(lineText);
    }
  }

  return allLines;
}

/**
 * 获取原始文本用于调试
 */
export async function extractRawTextForDebug(buffer) {
  const lines = await extractTextFromPdfBytes(buffer);
  return lines.join('\n');
}
