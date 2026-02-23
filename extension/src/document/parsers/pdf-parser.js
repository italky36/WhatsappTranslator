// PDF Parser
// Uses PDF.js (pdfjsLib global) for reading PDF files

// Configure worker path (relative to document.html)
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
}

/**
 * Parse a PDF file and extract text segments.
 * @param {File} file
 * @returns {Promise<{segments: Array, metadata: Object} | {error: string}>}
 */
async function parsePDF(file) {
  const arrayBuffer = await readPDFAsArrayBuffer(file);
  const originalArrayBuffer = cloneArrayBuffer(arrayBuffer);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const segments = [];
  let index = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const blocks = buildTextBlocks(textContent.items, viewport);

    for (const block of blocks) {
      if (!block.text.trim()) continue;

      segments.push({
        text: block.text,
        index: index++,
        meta: {
          page: pageNum,
          blockIndex: block.blockIndex,
          bbox: block.bbox,
          style: block.style,
        },
      });
    }
  }

  if (!segments.length) {
    return { error: 'NO_TEXT_LAYER' };
  }

  const totalChars = segments.reduce((sum, segment) => sum + segment.text.length, 0);

  return {
    segments,
    metadata: {
      type: 'pdf',
      fileName: file.name,
      pageCount,
      hasTextLayer: true,
      totalSegments: segments.length,
      totalChars,
      originalArrayBuffer,
    },
  };
}

/**
 * Build logical text blocks from PDF text items.
 * @param {Array} items - PDF.js text content items
 * @param {Object} viewport - PDF.js viewport with scale=1
 * @returns {Array<{text: string, blockIndex: number, bbox: Object, style: Object}>}
 */
function buildTextBlocks(items, viewport) {
  const textItems = [];

  for (const item of items || []) {
    const normalized = normalizePdfText(item?.str);
    if (!normalized || !normalized.trim()) continue;

    const layout = extractItemLayout(item, normalized);
    if (!layout) continue;

    textItems.push({
      text: normalized,
      layout,
    });
  }

  if (!textItems.length) {
    return [];
  }

  const medianFontSize = getMedian(
    textItems
      .map((entry) => Number(entry.layout.fontSize || 0))
      .filter((value) => Number.isFinite(value) && value > 0)
  ) || 10;
  const yTolerance = Math.max(1.5, medianFontSize * 0.45);
  const ordered = textItems.slice().sort((a, b) => {
    const dy = b.layout.y - a.layout.y;
    if (Math.abs(dy) > yTolerance) return dy;
    return a.layout.x - b.layout.x;
  });

  const lines = [];
  for (const entry of ordered) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || Math.abs(lastLine.baselineY - entry.layout.y) > yTolerance) {
      lines.push({
        baselineY: entry.layout.y,
        items: [entry],
      });
      continue;
    }

    const count = lastLine.items.length;
    lastLine.items.push(entry);
    lastLine.baselineY = ((lastLine.baselineY * count) + entry.layout.y) / (count + 1);
  }

  const blocks = [];
  let blockIndex = 0;
  for (const line of lines) {
    const lineItems = line.items.slice().sort((a, b) => a.layout.x - b.layout.x);
    const text = buildLineText(lineItems);
    if (!text) continue;

    const summary = summarizeLayouts(
      lineItems.map((entry) => entry.layout),
      viewport
    );
    summary.bbox.height = Math.max(summary.bbox.height, medianFontSize * 1.12);

    blocks.push({
      text,
      blockIndex: blockIndex++,
      bbox: summary.bbox,
      style: summary.style,
    });
  }

  return blocks;
}

function buildLineText(lineItems) {
  let result = '';
  let previous = null;

  for (const entry of lineItems || []) {
    const current = String(entry?.text || '').replace(/\s+/g, ' ').trim();
    if (!current) continue;

    if (!previous) {
      result = current;
      previous = entry;
      continue;
    }

    const gap = Number(entry.layout.x || 0) -
      (Number(previous.layout.x || 0) + Number(previous.layout.width || 0));
    const fontSize = Math.max(
      6,
      Number(previous.layout.fontSize || 0),
      Number(entry.layout.fontSize || 0)
    );

    result += buildGapSeparator(gap, fontSize);
    result += current;
    previous = entry;
  }

  return result.trim();
}

function buildGapSeparator(gap, fontSize) {
  if (!(gap > 0.2)) return '';
  if (gap < fontSize * 0.45) return '';
  if (gap < fontSize * 1.4) return ' ';

  const spaces = clamp(
    Math.round(gap / Math.max(fontSize * 0.78, 3)),
    2,
    6
  );
  return ' '.repeat(spaces);
}

function getMedian(numbers) {
  if (!Array.isArray(numbers) || !numbers.length) {
    return 0;
  }

  const sorted = numbers.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function extractItemLayout(item, text) {
  if (!item || !text) return null;

  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = Number(transform[4] || 0);
  const y = Number(transform[5] || 0);
  const rawHeight = Number(item.height || Math.abs(Number(transform[3] || 0)) || 0);
  const fontSize = Math.max(4, rawHeight || Math.abs(Number(transform[0] || 0)) || 10);
  let width = Number(item.width || 0);

  if (!(width > 0)) {
    width = estimateTextWidth(text, fontSize);
  }

  return {
    x,
    y,
    width: Math.max(4, width),
    height: Math.max(4, rawHeight || fontSize),
    fontSize,
    fontName: String(item.fontName || ''),
  };
}

function summarizeLayouts(layouts, viewport) {
  const pageWidth = Number(viewport?.width || 0);
  const pageHeight = Number(viewport?.height || 0);

  if (!Array.isArray(layouts) || !layouts.length) {
    return {
      bbox: {
        x: 24,
        y: Math.max(0, pageHeight - 40),
        width: Math.max(120, pageWidth - 48),
        height: 18,
      },
      style: {
        fontSize: 11,
        fontName: '',
      },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let fontSizeSum = 0;
  const fontNames = new Map();

  for (const layout of layouts) {
    minX = Math.min(minX, layout.x);
    minY = Math.min(minY, layout.y);
    maxX = Math.max(maxX, layout.x + layout.width);
    maxY = Math.max(maxY, layout.y + layout.height);
    fontSizeSum += Number(layout.fontSize || 0);

    const fontName = String(layout.fontName || '');
    if (fontName) {
      fontNames.set(fontName, (fontNames.get(fontName) || 0) + 1);
    }
  }

  const safeMinX = clamp(minX, 0, Math.max(0, pageWidth - 1));
  const safeMaxX = clamp(maxX, safeMinX + 4, Math.max(safeMinX + 4, pageWidth));
  const safeMinY = clamp(minY, 0, Math.max(0, pageHeight - 1));
  const safeMaxY = clamp(maxY, safeMinY + 4, Math.max(safeMinY + 4, pageHeight));

  let dominantFontName = '';
  let dominantFontCount = 0;
  for (const [name, count] of fontNames.entries()) {
    if (count > dominantFontCount) {
      dominantFontName = name;
      dominantFontCount = count;
    }
  }

  return {
    bbox: {
      x: safeMinX,
      y: safeMinY,
      width: Math.max(4, safeMaxX - safeMinX),
      height: Math.max(4, safeMaxY - safeMinY),
    },
    style: {
      fontSize: Math.max(6, fontSizeSum / layouts.length),
      fontName: dominantFontName,
    },
  };
}

function estimateTextWidth(text, fontSize) {
  return Math.max(4, String(text || '').length * Math.max(4, fontSize) * 0.56);
}

function normalizePdfText(value) {
  const source = String(value || '').replace(/\u0000/g, '');
  if (!source) return '';

  const normalized = source.normalize('NFC');
  if (!looksLikeBrokenEncoding(normalized)) {
    return normalized;
  }

  const repaired = tryRepairMojibake(normalized);
  return repaired ? repaired.normalize('NFC') : normalized;
}

function looksLikeBrokenEncoding(text) {
  if (!text) return false;
  return /[�□]/.test(text) || /(Ã.|Ð.|Ñ.|Â.)/.test(text);
}

function tryRepairMojibake(text) {
  if (!text || typeof TextDecoder !== 'function') return '';

  try {
    const bytes = new Uint8Array(Array.from(text, (char) => char.charCodeAt(0) & 0xFF));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!decoded || decoded === text) return '';

    const beforeScore = getTextQualityScore(text);
    const afterScore = getTextQualityScore(decoded);
    return afterScore > beforeScore ? decoded : '';
  } catch (error) {
    return '';
  }
}

function getTextQualityScore(text) {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const broken = (text.match(/[�□ÃÐÑÂ]/g) || []).length;
  return (cyrillic * 2) + latin - (broken * 3);
}

/**
 * Rebuild translated PDF by rendering original pages and overlaying translated blocks.
 * Result keeps page geometry visually close to the original.
 * @param {ArrayBuffer} originalArrayBuffer
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {Promise<Blob>}
 */
async function rebuildPDF(originalArrayBuffer, translatedSegments, metadata) {
  if (!(originalArrayBuffer instanceof ArrayBuffer)) {
    throw new Error('Original PDF data is missing.');
  }

  if (typeof PDFLib === 'undefined' || !PDFLib.PDFDocument) {
    throw new Error('pdf-lib is not loaded.');
  }

  const sourcePdf = await pdfjsLib.getDocument({ data: cloneArrayBuffer(originalArrayBuffer) }).promise;
  const outputPdf = await PDFLib.PDFDocument.create();
  const pageCount = Number(metadata?.pageCount || sourcePdf.numPages || 0);
  const segmentsByPage = groupSegmentsByPage(translatedSegments);

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const sourcePage = await sourcePdf.getPage(pageNum);
    const baseViewport = sourcePage.getViewport({ scale: 1 });
    const renderScale = resolveRenderScale(pageCount);
    const renderViewport = sourcePage.getViewport({ scale: renderScale });

    const canvas = createRenderCanvas(renderViewport.width, renderViewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to get canvas context for PDF rendering.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await sourcePage.render({
      canvasContext: context,
      viewport: renderViewport,
    }).promise;

    const pageSegments = segmentsByPage.get(pageNum) || [];
    overlayTranslatedBlocks(context, pageSegments, baseViewport, renderScale);

    const imageBytes = await canvasToJpegBytes(canvas, 0.92);
    const embeddedImage = await outputPdf.embedJpg(imageBytes);

    const outputPage = outputPdf.addPage([baseViewport.width, baseViewport.height]);
    outputPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });

    canvas.width = 1;
    canvas.height = 1;
  }

  const bytes = await outputPdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function groupSegmentsByPage(translatedSegments) {
  const map = new Map();
  for (const segment of translatedSegments || []) {
    const page = Number(segment?.meta?.page || 1);
    if (!map.has(page)) {
      map.set(page, []);
    }
    map.get(page).push(segment);
  }

  for (const [, entries] of map.entries()) {
    entries.sort((a, b) => Number(a?.meta?.blockIndex || 0) - Number(b?.meta?.blockIndex || 0));
  }

  return map;
}

function resolveRenderScale(pageCount) {
  if (pageCount > 60) return 1.0;
  if (pageCount > 25) return 1.2;
  return 1.45;
}

function overlayTranslatedBlocks(context, segments, viewport, scale) {
  if (!Array.isArray(segments) || !segments.length) return;

  const pageHeight = Number(viewport?.height || 0);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#111111';

  for (const segment of segments) {
    const text = String(segment?.translatedText || segment?.text || '').trim();
    if (!text) continue;

    const bbox = segment?.meta?.bbox;
    if (!bbox) continue;

    const rectX = Math.max(0, Number(bbox.x || 0) * scale);
    const rectWidth = Math.max(8, Number(bbox.width || 0) * scale);
    const rectHeight = Math.max(10, Number(bbox.height || 0) * scale);
    const rectY = Math.max(0, (pageHeight - (Number(bbox.y || 0) + Number(bbox.height || 0))) * scale);

    const padding = Math.max(1.5, Math.min(rectHeight * 0.2, 5.5 * scale));
    const maxTextWidth = Math.max(6, rectWidth - padding * 2);
    const maxTextHeight = Math.max(8, rectHeight - padding * 2);

    let fontSize = clamp(
      Number(segment?.meta?.style?.fontSize || bbox.height || 11) * scale * 0.94,
      6.5 * scale,
      Math.max(8 * scale, rectHeight * 0.95)
    );

    let lines = [];
    let lineHeight = 0;
    let maxLines = 1;

    while (true) {
      context.font = `${fontSize}px "Times New Roman", Arial, sans-serif`;
      lines = wrapTextLines(context, text, maxTextWidth);
      lineHeight = Math.max(fontSize * 1.17, 8 * scale);
      maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight));

      if (lines.length <= maxLines || fontSize <= 6.5 * scale) {
        break;
      }

      fontSize *= 0.9;
    }

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = trimLineWithEllipsis(context, lines[maxLines - 1], maxTextWidth);
    }

    context.fillStyle = '#ffffff';
    context.fillRect(rectX - 1, rectY - 1, rectWidth + 2, rectHeight + 2);

    context.save();
    context.beginPath();
    context.rect(rectX, rectY, rectWidth, rectHeight);
    context.clip();

    context.fillStyle = '#111111';
    context.font = `${fontSize}px "Times New Roman", Arial, sans-serif`;

    let drawY = rectY + padding + fontSize;
    const drawX = rectX + padding;

    for (const line of lines) {
      if (drawY > rectY + rectHeight + lineHeight * 0.1) break;
      context.fillText(line, drawX, drawY);
      drawY += lineHeight;
    }

    context.restore();
  }
}

function wrapTextLines(context, text, maxWidth) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const tokens = normalized.split(' ');
  const lines = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (context.measureText(token).width <= maxWidth) {
      current = token;
      continue;
    }

    const pieces = splitLongToken(context, token, maxWidth);
    if (pieces.length) {
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1];
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [''];
}

function splitLongToken(context, token, maxWidth) {
  const pieces = [];
  let start = 0;

  while (start < token.length) {
    let end = start + 1;
    let lastGood = end;

    while (end <= token.length) {
      const chunk = token.slice(start, end);
      if (context.measureText(chunk).width <= maxWidth) {
        lastGood = end;
        end += 1;
      } else {
        break;
      }
    }

    if (lastGood === start) {
      lastGood = Math.min(token.length, start + 1);
    }

    pieces.push(token.slice(start, lastGood));
    start = lastGood;
  }

  return pieces;
}

function trimLineWithEllipsis(context, line, maxWidth) {
  const suffix = '...';
  if (context.measureText(line).width <= maxWidth) {
    return line;
  }

  let value = line;
  while (value.length > 1 && context.measureText(value + suffix).width > maxWidth) {
    value = value.slice(0, -1);
  }

  return value + suffix;
}

function createRenderCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

async function canvasToJpegBytes(canvas, quality) {
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  if (blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function readPDFAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function cloneArrayBuffer(buffer) {
  return buffer.slice(0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build markdown output from translated segments, grouped by page.
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {string}
 */
function buildTranslatedMarkdown(translatedSegments, metadata) {
  const segmentsByPage = groupSegmentsByPage(translatedSegments);
  const pageCount = resolvePdfPageCount(segmentsByPage, metadata);
  const title = stripFileExtension(String(metadata?.fileName || 'PDF'));
  const lines = [`# ${title} translated`, ''];

  for (let page = 1; page <= pageCount; page++) {
    if (page > 1) {
      lines.push('<!--PAGE_BREAK-->');
    }
    const pageSegments = segmentsByPage.get(page) || [];

    if (!pageSegments.length) {
      lines.push('- (no text)');
      lines.push('');
      continue;
    }

    const pageBlocks = buildPageMarkdownBlocks(pageSegments);
    for (const block of pageBlocks) {
      if (block.type === 'text') {
        lines.push(`- ${block.text}`);
        continue;
      }

      if (block.type === 'table') {
        const tableLines = convertRowsToMarkdownTable(block.rows);
        lines.push(...tableLines);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function buildPageMarkdownBlocks(pageSegments) {
  const blocks = [];
  let pendingTableRows = [];

  const flushTableRows = () => {
    if (pendingTableRows.length >= 2) {
      blocks.push({ type: 'table', rows: pendingTableRows.slice() });
    } else if (pendingTableRows.length === 1) {
      blocks.push({ type: 'text', text: pendingTableRows[0].join(' ') });
    }
    pendingTableRows = [];
  };

  for (const segment of pageSegments) {
    const text = getSegmentText(segment);
    if (!text) continue;

    const tableCells = parseTableRowFromSegmentText(text);
    if (tableCells) {
      pendingTableRows.push(tableCells);
      continue;
    }

    flushTableRows();
    blocks.push({ type: 'text', text });
  }

  flushTableRows();
  return blocks;
}

function parseTableRowFromSegmentText(text) {
  const cells = String(text || '')
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 2) {
    return null;
  }

  return cells;
}

function convertRowsToMarkdownTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return [];
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const clone = row.slice();
    while (clone.length < columnCount) clone.push('');
    return clone;
  });

  const headerRow = normalizedRows[0];
  const bodyRows = normalizedRows.slice(1);
  const lines = [];
  lines.push(`| ${headerRow.map(sanitizeMarkdownCell).join(' | ')} |`);
  lines.push(`| ${new Array(columnCount).fill('---').join(' | ')} |`);

  for (const row of bodyRows) {
    lines.push(`| ${row.map(sanitizeMarkdownCell).join(' | ')} |`);
  }

  return lines;
}

function sanitizeMarkdownCell(value) {
  return String(value || '').replace(/\|/g, '/').trim();
}

/**
 * Build a readable DOCX file from markdown.
 * @param {string} markdown
 * @param {Object} metadata
 * @returns {Promise<Blob>}
 */
async function buildTranslatedDocxFromMarkdown(markdown, metadata) {
  if (typeof JSZip !== 'function') {
    throw new Error('JSZip is not loaded.');
  }

  const paragraphs = parseMarkdownParagraphs(markdown);
  let bodyXml = '';
  for (const paragraph of paragraphs) {
    if (paragraph.type === 'blank') {
      bodyXml += '<w:p/>';
      continue;
    }

    if (paragraph.type === 'table') {
      bodyXml += buildDocxTableXml(paragraph.rows);
      continue;
    }

    bodyXml += buildDocxParagraphXml(paragraph.text, paragraph.styleId);
  }

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
    'xmlns:v="urn:schemas-microsoft-com:vml" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
    'mc:Ignorable="w14 wp14">' +
    '<w:body>' + bodyXml +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="240" w:after="160"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2">' +
    '<w:name w:val="heading 2"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:before="180" w:after="120"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="26"/></w:rPr>' +
    '</w:style>' +
    '</w:styles>';

  const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const wordRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', wordRelsXml);

  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/**
 * Build a text PDF from markdown using pdfmake.
 * Keeps text selectable/searchable and supports Cyrillic/Polish via embedded Roboto font.
 * @param {string} markdown
 * @param {Object} metadata
 * @returns {Promise<Blob>}
 */
async function buildTranslatedPdfFromMarkdown(markdown, metadata) {
  if (typeof pdfMake === 'undefined' || typeof pdfMake.createPdf !== 'function') {
    throw new Error('pdfmake is not loaded.');
  }

  const paragraphs = parseMarkdownParagraphs(markdown);
  const content = buildPdfContentFromMarkdownParagraphs(paragraphs);
  const sourceTitle = stripFileExtension(String(metadata?.fileName || 'PDF'));
  const docDefinition = {
    info: {
      title: `${sourceTitle} translated`,
      creator: 'whatsapp-translator',
    },
    pageSize: 'A4',
    pageMargins: [36, 44, 36, 44],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.18,
    },
    styles: {
      pdfTitle: {
        fontSize: 16,
        bold: true,
        margin: [0, 0, 0, 10],
      },
      pdfHeading: {
        fontSize: 12,
        bold: true,
        margin: [0, 8, 0, 5],
      },
      pdfParagraph: {
        margin: [0, 1, 0, 1],
      },
      pdfTableHeader: {
        bold: true,
        fillColor: '#e5e7eb',
      },
    },
    content: content.length ? content : [{ text: '(no text)', style: 'pdfParagraph' }],
  };

  return createPdfMakeBlob(docDefinition);
}

function buildPdfContentFromMarkdownParagraphs(paragraphs) {
  const content = [];
  let pendingBullets = [];
  let pendingPageBreak = false;

  const pushContentBlock = (block) => {
    if (!block) return;
    if (pendingPageBreak) {
      block.pageBreak = 'before';
      pendingPageBreak = false;
    }
    content.push(block);
  };

  const flushBullets = () => {
    if (!pendingBullets.length) return;
    pushContentBlock({
      ul: pendingBullets.slice(),
      margin: [10, 2, 0, 4],
    });
    pendingBullets = [];
  };

  for (const paragraph of paragraphs || []) {
    if (paragraph.type === 'page-break') {
      flushBullets();
      pendingPageBreak = true;
      continue;
    }

    if (paragraph.type === 'blank') {
      flushBullets();
      if (!pendingPageBreak) {
        pushContentBlock({ text: '', style: 'pdfParagraph' });
      }
      continue;
    }

    if (paragraph.type === 'table') {
      flushBullets();
      pushContentBlock(buildPdfTableBlock(paragraph.rows));
      continue;
    }

    const text = formatPdfText(paragraph.text);
    if (!text) continue;

    if (/^-\s+/.test(text)) {
      pendingBullets.push(text.replace(/^-\s+/, '').trim());
      continue;
    }

    flushBullets();
    if (paragraph.styleId === 'Heading1') {
      pushContentBlock({ text, style: 'pdfTitle' });
      continue;
    }
    if (paragraph.styleId === 'Heading2') {
      pushContentBlock({ text, style: 'pdfHeading' });
      continue;
    }

    pushContentBlock({ text, style: 'pdfParagraph' });
  }

  flushBullets();
  return content;
}

function buildPdfTableBlock(rows) {
  const normalizedRows = normalizeTabularRows(rows);
  if (!normalizedRows.length) {
    return { text: '', style: 'pdfParagraph' };
  }

  const columnCount = normalizedRows[0].length;
  const widths = new Array(columnCount).fill('*');
  const body = [];

  for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex++) {
    const row = normalizedRows[rowIndex];
    const mapped = row.map((cell) => {
      const text = formatPdfText(cell);
      if (rowIndex === 0) {
        return { text, style: 'pdfTableHeader' };
      }
      return { text };
    });
    body.push(mapped);
  }

  return {
    table: {
      headerRows: 1,
      widths,
      body,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
    fontSize: 9.4,
  };
}

function normalizeTabularRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const columnCount = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0), 0);
  if (!columnCount) {
    return [];
  }

  return rows.map((row) => {
    const source = Array.isArray(row) ? row : [String(row || '')];
    const clone = source.map((cell) => String(cell || '').trim());
    while (clone.length < columnCount) {
      clone.push('');
    }
    return clone;
  });
}

function formatPdfText(value) {
  return sanitizeXmlChars(value).replace(/\s+/g, ' ').trim();
}

function createPdfMakeBlob(docDefinition) {
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBlob((blob) => {
        if (blob instanceof Blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Failed to build PDF blob.'));
      });
    } catch (error) {
      reject(error);
    }
  });
}

function parseMarkdownParagraphs(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const paragraphs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (!trimmed) {
      paragraphs.push({ type: 'blank' });
      continue;
    }

    if (trimmed === '<!--PAGE_BREAK-->') {
      paragraphs.push({ type: 'page-break' });
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      const parsed = parseMarkdownTable(lines, i);
      if (parsed) {
        paragraphs.push({ type: 'table', rows: parsed.rows });
        i = parsed.endIndex;
        continue;
      }
    }

    if (/^##\s+/.test(trimmed)) {
      paragraphs.push({
        type: 'text',
        styleId: 'Heading2',
        text: trimmed.replace(/^##\s+/, ''),
      });
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      paragraphs.push({
        type: 'text',
        styleId: 'Heading1',
        text: trimmed.replace(/^#\s+/, ''),
      });
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      paragraphs.push({
        type: 'text',
        styleId: 'Normal',
        text: trimmed,
      });
      continue;
    }

    paragraphs.push({
      type: 'text',
      styleId: 'Normal',
      text: trimmed,
    });
  }

  return paragraphs;
}

function isMarkdownTableStart(lines, index) {
  if (!Array.isArray(lines) || index < 0 || index >= lines.length - 1) {
    return false;
  }

  const header = String(lines[index] || '').trim();
  const separator = String(lines[index + 1] || '').trim();
  return isMarkdownTableRow(header) && isMarkdownTableSeparator(separator);
}

function isMarkdownTableRow(line) {
  const value = String(line || '').trim();
  return /^\|.*\|$/.test(value) && value.split('|').length >= 4;
}

function isMarkdownTableSeparator(line) {
  const value = String(line || '').trim();
  if (!/^\|.*\|$/.test(value)) return false;
  const parts = value.slice(1, -1).split('|').map((part) => part.trim());
  if (!parts.length) return false;
  return parts.every((part) => /^:?-{3,}:?$/.test(part));
}

function parseMarkdownTable(lines, startIndex) {
  const headerLine = String(lines[startIndex] || '').trim();
  const separatorLine = String(lines[startIndex + 1] || '').trim();
  if (!isMarkdownTableRow(headerLine) || !isMarkdownTableSeparator(separatorLine)) {
    return null;
  }

  const rows = [parseMarkdownTableRow(headerLine)];
  let index = startIndex + 2;
  while (index < lines.length) {
    const rowLine = String(lines[index] || '').trim();
    if (!isMarkdownTableRow(rowLine)) break;
    rows.push(parseMarkdownTableRow(rowLine));
    index += 1;
  }

  if (rows.length < 2) {
    return null;
  }

  return {
    rows,
    endIndex: index - 1,
  };
}

function parseMarkdownTableRow(line) {
  return String(line || '')
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
    .map((cell) => cell.replace(/\\\|/g, '|'));
}

function buildDocxParagraphXml(text, styleId) {
  const safeText = escapeDocxXml(String(text || ''));
  const safeStyleId = /^[A-Za-z0-9_]+$/.test(String(styleId || '')) ? styleId : 'Normal';
  return '<w:p>' +
    `<w:pPr><w:pStyle w:val="${safeStyleId}"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${safeText}</w:t></w:r>` +
    '</w:p>';
}

function buildDocxTableXml(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0), 0);
  if (!columnCount) {
    return '';
  }

  const normalizedRows = rows.map((row) => {
    const source = Array.isArray(row) ? row.slice() : [''];
    while (source.length < columnCount) source.push('');
    return source;
  });

  const tableWidthTwips = 9800;
  const colWidth = Math.max(900, Math.floor(tableWidthTwips / columnCount));
  let xml = '<w:tbl>' +
    '<w:tblPr>' +
    '<w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '</w:tblBorders>' +
    '</w:tblPr>' +
    '<w:tblGrid>';

  for (let i = 0; i < columnCount; i++) {
    xml += `<w:gridCol w:w="${colWidth}"/>`;
  }
  xml += '</w:tblGrid>';

  for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex++) {
    const row = normalizedRows[rowIndex];
    xml += '<w:tr>';

    for (const cellValue of row) {
      const safe = escapeDocxXml(String(cellValue || ''));
      const runProps = rowIndex === 0 ? '<w:rPr><w:b/></w:rPr>' : '';
      xml += '<w:tc>' +
        `<w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr>` +
        '<w:p>' +
        `<w:r>${runProps}<w:t xml:space="preserve">${safe}</w:t></w:r>` +
        '</w:p>' +
        '</w:tc>';
    }

    xml += '</w:tr>';
  }

  xml += '</w:tbl>';
  return xml;
}

function escapeDocxXml(value) {
  const sanitized = sanitizeXmlChars(value);
  return sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeXmlChars(value) {
  // XML 1.0 valid chars: tab, CR, LF and U+0020..U+D7FF/U+E000..U+FFFD
  return String(value || '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '');
}

function resolvePdfPageCount(segmentsByPage, metadata) {
  const pageIndexes = Array.from(segmentsByPage.keys()).map((value) => Number(value) || 0);
  const maxSegmentPage = pageIndexes.length ? Math.max(...pageIndexes) : 0;
  const metadataPageCount = Number(metadata?.pageCount || 0);
  return Math.max(1, maxSegmentPage, metadataPageCount);
}

function getSegmentText(segment) {
  return String(segment?.translatedText || segment?.text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFileExtension(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex > 0) {
    return fileName.slice(0, dotIndex);
  }
  return fileName || 'PDF';
}

/**
 * Build plain text output from translated segments, grouped by page.
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {string}
 */
function buildTranslatedText(translatedSegments, metadata) {
  const segmentsByPage = groupSegmentsByPage(translatedSegments);
  const pageCount = resolvePdfPageCount(segmentsByPage, metadata);
  const lines = [];

  for (let page = 1; page <= pageCount; page++) {
    lines.push(`--- Page ${page} ---`);
    const pageSegments = segmentsByPage.get(page) || [];
    for (const segment of pageSegments) {
      const text = getSegmentText(segment);
      if (text) {
        lines.push(text);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build HTML output from translated segments for preview.
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {string}
 */
function buildTranslatedHTML(translatedSegments, metadata) {
  const segmentsByPage = groupSegmentsByPage(translatedSegments);
  const pageCount = resolvePdfPageCount(segmentsByPage, metadata);
  let html = '';

  for (let page = 1; page <= pageCount; page++) {
    html += `<div class="pdf-page"><h3>Page ${page}</h3>`;
    const pageSegments = segmentsByPage.get(page) || [];
    for (const segment of pageSegments) {
      const escaped = getSegmentText(segment)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (escaped) {
        html += `<p>${escaped}</p>`;
      }
    }
    html += '</div>';
  }

  return html;
}
