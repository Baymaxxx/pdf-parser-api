/**
 * 纯原生 PDF 文本提取器 v2
 * 多策略提取，兼容更多 PDF 格式
 */

function decodePdfString(str) {
  if (str.startsWith('<') && str.endsWith('>')) {
    const hex = str.slice(1, -1).replace(/\s/g, '');
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substr(i, 2), 16);
      if (!isNaN(code)) result += String.fromCharCode(code);
    }
    return result;
  }
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * 从 BT...ET 块中提取文本片段（带位置信息）
 */
function extractFromBtBlock(block) {
  const texts = [];

  // 匹配 Td/TD/Tm 位置指令 + 文本
  const lines = block.split(/\r?\n/);
  let currentY = 0;

  for (const line of lines) {
    // 匹配 Td/TD 位置
    const tdMatch = line.match(/^([-\d.]+)\s+([-\d.]+)\s+Td/);
    if (tdMatch) currentY += parseFloat(tdMatch[2]);

    const tmMatch = line.match(/^[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm/);
    if (tmMatch) currentY = parseFloat(tmMatch[2]);

    // 匹配 (text) Tj
    const tjMatch = line.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/);
    if (tjMatch) {
      const decoded = decodePdfString(tjMatch[1]);
      texts.push({ text: decoded, y: currentY });
    }

    // 匹配 [(text)...] TJ
    const tjArrayMatch = line.match(/\[([\s\S]*?)\]\s*TJ/);
    if (tjArrayMatch) {
      const parts = [];
      const inner = tjArrayMatch[1];
      const parenRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let m;
      while ((m = parenRegex.exec(inner)) !== null) {
        const decoded = decodePdfString(m[1]);
        if (decoded.trim()) parts.push(decoded);
      }
      if (parts.length) texts.push({ text: parts.join(''), y: currentY });
    }

    // 匹配 ' 操作符 (换行并显示)
    const primeMatch = line.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*'/);
    if (primeMatch) {
      const decoded = decodePdfString(primeMatch[1]);
      texts.push({ text: decoded, y: currentY });
    }
  }

  return texts;
}

/**
 * 主提取函数：从 PDF 字节流提取文本行
 */
export function extractTextFromPdfBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  let content = '';
  for (let i = 0; i < bytes.length; i++) {
    content += String.fromCharCode(bytes[i]);
  }

  const allTexts = [];

  // 策略1：解压后的 stream 内容（已解压的 PDF）
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(content)) !== null) {
    const fragments = extractFromBtBlock(match[1]);
    allTexts.push(...fragments);
  }

  // 策略2：多行括号格式（某些 PDF 工具生成）
  if (allTexts.length === 0) {
    const parenRegex = /\(([^)\\]{1,200})\)\s*(?:Tj|TJ|'|")/g;
    while ((match = parenRegex.exec(content)) !== null) {
      const decoded = decodePdfString(match[1]);
      const cleaned = decoded.replace(/[^\x20-\x7E\u00A0-\u00FF€]/g, '').trim();
      if (cleaned.length > 1) allTexts.push({ text: cleaned, y: 0 });
    }
  }

  // 将文本对象转换为字符串行
  const lines = allTexts
    .map(t => t.text)
    .map(t => t.replace(/[^\x20-\x7E\u00A0-\u00FF€]/g, '').trim())
    .filter(t => t.length > 0);

  return lines;
}

/**
 * 获取原始文本用于调试（保留更多内容）
 */
export function extractRawTextForDebug(buffer) {
  const lines = extractTextFromPdfBytes(buffer);
  return lines.join('\n');
}
