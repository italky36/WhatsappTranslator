// PDF Parser
// Uses PDF.js (pdfjsLib global) for reading PDF files
// Uses pdf-lib (PDFLib global) + fontkit for assembling translated PDFs

// Configure worker path (relative to document.html)
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
}

// ═══════════════════════════════════════════════════════════════════
// Main entry point: Parse PDF
// ═══════════════════════════════════════════════════════════════════

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

  const allBlocks = [];
  const pagesMeta = [];
  let index = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    pagesMeta.push({
      pageNum,
      width: viewport.width,
      height: viewport.height,
    });

    const blocks = buildTextBlocks(textContent.items, viewport);
    for (const block of blocks) {
      if (!block.text.trim()) continue;
      block.page = pageNum;
      block.pageWidth = viewport.width;
      block.pageHeight = viewport.height;
      block.index = index++;
      allBlocks.push(block);
    }
  }

  if (!allBlocks.length) {
    return { error: 'NO_TEXT_LAYER' };
  }

  // Classify, detect tables, filter, group
  classifyBlocks(allBlocks, pagesMeta, pageCount);
  detectTables(allBlocks, pagesMeta);
  markSkipTranslation(allBlocks);
  const segments = smartGroupBlocks(allBlocks);

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);

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
      pagesMeta,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Text block extraction from PDF.js
// ═══════════════════════════════════════════════════════════════════

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

  const fontName = String(item.fontName || '');
  const isBold = /bold|demi|heavy|\-B[,\s]/i.test(fontName);
  const isItalic = /italic|oblique|\-I[,\s]/i.test(fontName);

  return {
    x,
    y,
    width: Math.max(4, width),
    height: Math.max(4, rawHeight || fontSize),
    fontSize,
    fontName,
    isBold,
    isItalic,
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
        isBold: false,
        isItalic: false,
      },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let fontSizeSum = 0;
  const fontNames = new Map();

  let boldCount = 0;
  let italicCount = 0;

  for (const layout of layouts) {
    minX = Math.min(minX, layout.x);
    minY = Math.min(minY, layout.y);
    maxX = Math.max(maxX, layout.x + layout.width);
    maxY = Math.max(maxY, layout.y + layout.height);
    fontSizeSum += Number(layout.fontSize || 0);
    if (layout.isBold) boldCount++;
    if (layout.isItalic) italicCount++;

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
      isBold: boldCount > layouts.length / 2,
      isItalic: italicCount > layouts.length / 2,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Text utilities
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// Phase 2: Block classification
// ═══════════════════════════════════════════════════════════════════

function classifyBlocks(blocks, pagesMeta, pageCount) {
  const pageDims = new Map();
  for (const pm of pagesMeta) {
    pageDims.set(pm.pageNum, { width: pm.width, height: pm.height });
  }

  const allFontSizes = blocks
    .map((b) => b.style.fontSize)
    .filter((v) => Number.isFinite(v) && v > 0);
  const medianFontSize = getMedian(allFontSizes) || 10;

  // Collect texts in header/footer zones across pages for repeat detection
  const zoneTexts = new Map();
  for (const block of blocks) {
    const dims = pageDims.get(block.page) || { width: 595, height: 842 };
    const relY = block.bbox.y / dims.height;
    const isTopZone = relY > 0.95;
    const isBottomZone = relY < 0.08;
    if ((isTopZone || isBottomZone) && block.style.fontSize < medianFontSize) {
      const key = block.text.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!zoneTexts.has(key)) zoneTexts.set(key, new Set());
      zoneTexts.get(key).add(block.page);
    }
  }

  for (const block of blocks) {
    const dims = pageDims.get(block.page) || { width: 595, height: 842 };
    const relY = block.bbox.y / dims.height;
    const isTopZone = relY > 0.95;
    const isBottomZone = relY < 0.08;
    const isSmallFont = block.style.fontSize < medianFontSize;
    const text = block.text.trim();

    // Page numbers
    if ((isTopZone || isBottomZone) && isSmallFont &&
        /^(\d+|page\s+\d+(\s+of\s+\d+)?|стр\.?\s*\d+|\d+\s*\/\s*\d+)$/i.test(text)) {
      block.classification = 'pageNumber';
      continue;
    }

    // Header/footer (repeated across pages)
    if ((isTopZone || isBottomZone) && isSmallFont) {
      const key = text.toLowerCase().replace(/\s+/g, ' ');
      if (zoneTexts.has(key) && zoneTexts.get(key).size >= 2) {
        block.classification = 'headerFooter';
        continue;
      }
    }

    // Headings
    if (block.style.fontSize > 14 ||
        block.style.fontSize > medianFontSize * 1.3 ||
        (block.style.isBold && block.style.fontSize >= 12)) {
      block.classification = 'heading';
      continue;
    }

    block.classification = 'body';
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3: Table detection
// ═══════════════════════════════════════════════════════════════════

function detectTables(blocks, pagesMeta) {
  const pageDims = new Map();
  for (const pm of pagesMeta) {
    pageDims.set(pm.pageNum, { width: pm.width, height: pm.height });
  }

  const pages = new Set(blocks.map((b) => b.page));
  let tableId = 0;

  for (const pageNum of pages) {
    const pageBlocks = blocks.filter((b) => b.page === pageNum && b.classification === 'body');
    if (pageBlocks.length < 4) continue;

    // Group into rows by Y proximity
    const sorted = pageBlocks.slice().sort((a, b) => b.bbox.y - a.bbox.y);
    const rows = [];
    for (const block of sorted) {
      const tol = block.style.fontSize / 2;
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow.y - block.bbox.y) < tol) {
        lastRow.blocks.push(block);
        lastRow.y = (lastRow.y * (lastRow.blocks.length - 1) + block.bbox.y) / lastRow.blocks.length;
      } else {
        rows.push({ y: block.bbox.y, blocks: [block] });
      }
    }

    // Candidate rows: rows with >= 2 blocks
    const candidateRows = rows.filter((r) => r.blocks.length >= 2);
    if (candidateRows.length < 2) continue;

    // Cluster X-start coordinates
    const allX = [];
    for (const row of candidateRows) {
      for (const b of row.blocks) {
        allX.push(b.bbox.x);
      }
    }
    const xClusters = clusterValues(allX, 10);
    if (xClusters.length < 2) continue;

    // Check cluster stability
    const stableClusters = xClusters.filter((cx) => {
      let count = 0;
      for (const row of candidateRows) {
        if (row.blocks.some((b) => Math.abs(b.bbox.x - cx) < 10)) count++;
      }
      return count >= candidateRows.length * 0.5;
    });
    if (stableClusters.length < 2) continue;

    stableClusters.sort((a, b) => a - b);
    const dims = pageDims.get(pageNum) || { width: 595, height: 842 };
    const currentTableId = tableId++;

    for (let rowIdx = 0; rowIdx < candidateRows.length; rowIdx++) {
      for (const block of candidateRows[rowIdx].blocks) {
        let bestCol = 0;
        let bestDist = Infinity;
        for (let ci = 0; ci < stableClusters.length; ci++) {
          const dist = Math.abs(block.bbox.x - stableClusters[ci]);
          if (dist < bestDist) {
            bestDist = dist;
            bestCol = ci;
          }
        }
        if (bestDist < 20) {
          block.classification = 'tableCell';
          const colWidth = bestCol < stableClusters.length - 1
            ? stableClusters[bestCol + 1] - stableClusters[bestCol]
            : dims.width - 20 - stableClusters[bestCol];
          block.tableInfo = {
            tableId: currentTableId,
            row: rowIdx,
            col: bestCol,
            colWidth: Math.max(30, colWidth),
          };
        }
      }
    }
  }
}

function clusterValues(values, tolerance) {
  if (!values.length) return [];
  const sorted = values.slice().sort((a, b) => a - b);
  const clusters = [];
  let clusterStart = sorted[0];
  let clusterSum = sorted[0];
  let clusterCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - clusterStart <= tolerance) {
      clusterSum += sorted[i];
      clusterCount++;
    } else {
      clusters.push(clusterSum / clusterCount);
      clusterStart = sorted[i];
      clusterSum = sorted[i];
      clusterCount = 1;
    }
  }
  clusters.push(clusterSum / clusterCount);
  return clusters;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 4: Skip-translation filtering
// ═══════════════════════════════════════════════════════════════════

function markSkipTranslation(blocks) {
  for (const block of blocks) {
    if (block.classification === 'pageNumber') {
      block.skipTranslation = true;
      continue;
    }

    const text = block.text.trim();

    if (text.length < 2) {
      block.skipTranslation = true;
      continue;
    }

    // Numbers, punctuation, currency only
    if (/^[\d\s.,;:\/%€$¥£₽+\-—–()]+$/.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    // Dates
    if (/^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$/.test(text) ||
        /^\d{4}[.\/\-]\d{1,2}[.\/\-]\d{1,2}$/.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    // Email
    if (/^\S+@\S+\.\S+$/.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    // URL
    if (/^(https?:\/\/|www\.)/i.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    // Phone numbers
    if (/^[+\d()\-\s]{7,}$/.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    // Russian identifiers
    if (/^(ИНН|ОГРН|КПП|БИК|ОКПО|ОКАТО)\s*:?\s*\d+$/i.test(text)) {
      block.skipTranslation = true;
      continue;
    }

    block.skipTranslation = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5: Smart grouping
// ═══════════════════════════════════════════════════════════════════

function smartGroupBlocks(blocks) {
  const sorted = blocks.slice().sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const dy = b.bbox.y - a.bbox.y;
    if (Math.abs(dy) > 2) return dy;
    return a.bbox.x - b.bbox.x;
  });

  // Step 1: Group same-line body blocks
  const merged = [];
  let i = 0;
  while (i < sorted.length) {
    const block = sorted[i];

    if (block.classification !== 'body' || block.skipTranslation) {
      merged.push(block);
      i++;
      continue;
    }

    const group = [block];
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      if (next.page !== block.page) break;
      if (next.classification !== 'body' || next.skipTranslation) break;

      const yDiff = Math.abs(next.bbox.y - block.bbox.y);
      const fontDiff = Math.abs(next.style.fontSize - block.style.fontSize);
      const gap = next.bbox.x - (group[group.length - 1].bbox.x + group[group.length - 1].bbox.width);

      if (yDiff < block.style.fontSize / 2 && fontDiff < 0.5 && gap < block.style.fontSize * 2) {
        group.push(next);
        j++;
      } else {
        break;
      }
    }

    if (group.length > 1) {
      merged.push(mergeBlockGroup(group));
    } else {
      merged.push(block);
    }
    i = j;
  }

  // Step 2: Group consecutive body lines into paragraphs
  const paragraphed = [];
  i = 0;
  while (i < merged.length) {
    const block = merged[i];

    if (block.classification !== 'body' || block.skipTranslation) {
      paragraphed.push(block);
      i++;
      continue;
    }

    const paraBlocks = [block];
    let k = i + 1;
    while (k < merged.length) {
      const next = merged[k];
      if (next.page !== block.page) break;
      if (next.classification !== 'body' || next.skipTranslation) break;

      const prev = paraBlocks[paraBlocks.length - 1];
      const fontDiff = Math.abs(next.style.fontSize - prev.style.fontSize);
      const xDiff = Math.abs(next.bbox.x - block.bbox.x);
      const vGap = prev.bbox.y - (next.bbox.y + next.bbox.height);

      if (fontDiff < 0.5 && xDiff < 5 && vGap >= 0 && vGap < prev.style.fontSize * 1.8) {
        paraBlocks.push(next);
        k++;
      } else {
        break;
      }
    }

    if (paraBlocks.length > 1) {
      paragraphed.push(mergeParagraphBlocks(paraBlocks));
    } else {
      paragraphed.push(block);
    }
    i = k;
  }

  // Build final segments
  const segments = [];
  let segIndex = 0;
  for (const block of paragraphed) {
    segments.push({
      text: block.text,
      index: segIndex++,
      meta: {
        page: block.page,
        blockIndex: block.blockIndex,
        bbox: block.bbox,
        style: block.style,
        classification: block.classification || 'body',
        tableInfo: block.tableInfo || null,
        skipTranslation: !!block.skipTranslation,
        originalBlocks: block.originalBlocks || [{ bbox: { ...block.bbox }, style: { ...block.style } }],
      },
    });
  }

  return segments;
}

function mergeBlockGroup(group) {
  const texts = group.map((b) => b.text.trim()).filter(Boolean);
  const minX = Math.min(...group.map((b) => b.bbox.x));
  const minY = Math.min(...group.map((b) => b.bbox.y));
  const maxX = Math.max(...group.map((b) => b.bbox.x + b.bbox.width));
  const maxY = Math.max(...group.map((b) => b.bbox.y + b.bbox.height));

  return {
    text: texts.join(' '),
    blockIndex: group[0].blockIndex,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    style: { ...group[0].style },
    page: group[0].page,
    pageWidth: group[0].pageWidth,
    pageHeight: group[0].pageHeight,
    classification: group[0].classification,
    skipTranslation: group[0].skipTranslation,
    originalBlocks: group.map((b) => ({ bbox: { ...b.bbox }, style: { ...b.style } })),
  };
}

function mergeParagraphBlocks(paraBlocks) {
  const texts = paraBlocks.map((b) => b.text.trim()).filter(Boolean);
  const minX = Math.min(...paraBlocks.map((b) => b.bbox.x));
  const minY = Math.min(...paraBlocks.map((b) => b.bbox.y));
  const maxX = Math.max(...paraBlocks.map((b) => b.bbox.x + b.bbox.width));
  const maxY = Math.max(...paraBlocks.map((b) => b.bbox.y + b.bbox.height));

  const allOriginals = [];
  for (const b of paraBlocks) {
    if (b.originalBlocks) {
      allOriginals.push(...b.originalBlocks);
    } else {
      allOriginals.push({ bbox: { ...b.bbox }, style: { ...b.style } });
    }
  }

  return {
    text: texts.join(' '),
    blockIndex: paraBlocks[0].blockIndex,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    style: { ...paraBlocks[0].style },
    page: paraBlocks[0].page,
    pageWidth: paraBlocks[0].pageWidth,
    pageHeight: paraBlocks[0].pageHeight,
    classification: paraBlocks[0].classification,
    skipTranslation: paraBlocks[0].skipTranslation,
    originalBlocks: allOriginals,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7: Text layout computation
// ═══════════════════════════════════════════════════════════════════

const EXPANSION_COEFFICIENTS = {
  'EN-RU': 1.30, 'RU-EN': 0.77,
  'EN-DE': 1.25, 'DE-EN': 0.80,
  'EN-FR': 1.20, 'FR-EN': 0.85,
  'EN-ES': 1.25, 'ES-EN': 0.80,
  'EN-PL': 1.20, 'PL-EN': 0.85,
  'EN-ZH': 0.70, 'ZH-EN': 1.40,
  'EN-JA': 0.60, 'JA-EN': 1.50,
  'EN-AR': 0.90, 'AR-EN': 1.10,
};

function getMinFontSize(classification, originalFontSize) {
  switch (classification) {
    case 'heading':
      return Math.max(5, originalFontSize * 0.80);
    case 'tableCell':
      return Math.max(5, originalFontSize * 0.60);
    case 'headerFooter':
      return Math.max(5, originalFontSize * 0.80);
    default:
      return Math.max(5, originalFontSize * 0.75);
  }
}

function computeTextLayout(translatedText, segment, pageMeta, allPageSegments, regularFont, boldFont) {
  const origBbox = segment.meta.bbox;
  const style = segment.meta.style;
  const classification = segment.meta.classification || 'body';
  const activeFont = style.isBold ? boldFont : regularFont;
  const fontSize = style.fontSize;

  // Step 1: Direct substitution
  try {
    const directWidth = activeFont.widthOfTextAtSize(translatedText, fontSize);
    if (directWidth <= origBbox.width) {
      return {
        lines: [translatedText],
        fontSize,
        bbox: { ...origBbox },
        lineHeight: fontSize * 1.2,
      };
    }
  } catch (e) { /* font measurement can fail on special chars */ }

  // Step 2: Expand bbox right
  const maxWidth = findAvailableWidth(origBbox, allPageSegments, pageMeta, segment);

  try {
    const directWidth = activeFont.widthOfTextAtSize(translatedText, fontSize);
    if (directWidth <= maxWidth) {
      return {
        lines: [translatedText],
        fontSize,
        bbox: { ...origBbox, width: maxWidth },
        lineHeight: fontSize * 1.2,
      };
    }
  } catch (e) { /* continue */ }

  // Step 3: Word wrap at original font size
  const wrapped = wrapTextForPdf(translatedText, maxWidth, fontSize, activeFont);
  const neededHeight = wrapped.length * fontSize * 1.2;
  if (neededHeight <= origBbox.height * 1.2) {
    return {
      lines: wrapped,
      fontSize,
      bbox: { ...origBbox, width: maxWidth },
      lineHeight: fontSize * 1.2,
    };
  }

  // Step 4: Reduce font size
  const minFontSize = getMinFontSize(classification, fontSize);
  let currentSize = fontSize;
  while (currentSize > minFontSize) {
    currentSize = Math.max(minFontSize, currentSize - 0.5);
    const w = wrapTextForPdf(translatedText, maxWidth, currentSize, activeFont);
    const h = w.length * currentSize * 1.2;
    if (h <= origBbox.height * 1.2) {
      return {
        lines: w,
        fontSize: currentSize,
        bbox: { ...origBbox, width: maxWidth },
        lineHeight: currentSize * 1.2,
      };
    }
  }

  // Step 5: Best effort with min font size
  const finalWrapped = wrapTextForPdf(translatedText, maxWidth, minFontSize, activeFont);
  return {
    lines: finalWrapped,
    fontSize: minFontSize,
    bbox: { ...origBbox, width: maxWidth },
    lineHeight: minFontSize * 1.2,
  };
}

function findAvailableWidth(bbox, allPageSegments, pageMeta, currentSegment) {
  const rightEdge = bbox.x + bbox.width;
  const pageRightMargin = (pageMeta?.width || 595) - 20;
  let nearestRightX = pageRightMargin;

  for (const other of allPageSegments) {
    if (other === currentSegment) continue;
    const otherBbox = other.meta?.bbox;
    if (!otherBbox) continue;

    const overlapY = !(otherBbox.y + otherBbox.height < bbox.y || otherBbox.y > bbox.y + bbox.height);
    if (overlapY && otherBbox.x > rightEdge) {
      nearestRightX = Math.min(nearestRightX, otherBbox.x - 2);
    }
  }

  return Math.max(bbox.width, nearestRightX - bbox.x);
}

function wrapTextForPdf(text, maxWidth, fontSize, font) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    let width;
    try {
      width = font.widthOfTextAtSize(candidate, fontSize);
    } catch (e) {
      width = candidate.length * fontSize * 0.5;
    }

    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [normalized];
}

// ═══════════════════════════════════════════════════════════════════
// Phase 8: PDF Assembly via pdf-lib
// ═══════════════════════════════════════════════════════════════════

/**
 * Remove all text operators (BT...ET blocks) from a PDF page's content stream.
 * This prevents original text from being copy-pasted after translation overlay.
 */
function stripTextFromPage(page, pdfDoc) {
  const contentsRef = page.node.get(PDFLib.PDFName.of('Contents'));
  if (!contentsRef) return;

  // Collect all stream references
  const streamRefs = [];
  const resolved = contentsRef instanceof PDFLib.PDFRef
    ? pdfDoc.context.lookup(contentsRef)
    : contentsRef;

  if (resolved instanceof PDFLib.PDFArray) {
    for (let i = 0; i < resolved.size(); i++) {
      const ref = resolved.get(i);
      if (ref instanceof PDFLib.PDFRef) {
        streamRefs.push(ref);
      }
    }
  } else if (contentsRef instanceof PDFLib.PDFRef) {
    streamRefs.push(contentsRef);
  }

  for (const ref of streamRefs) {
    try {
      const stream = pdfDoc.context.lookup(ref);
      if (!stream) continue;

      // Decode the stream (handles FlateDecode etc.)
      let decoded;
      try {
        const result = PDFLib.decodePDFRawStream(stream);
        decoded = result.decode();
      } catch (e) {
        // If decode fails, try reading raw bytes
        if (stream.contents || stream.getContents) {
          decoded = stream.contents || stream.getContents();
        } else {
          continue;
        }
      }

      // Convert Uint8Array to string
      let text;
      if (decoded instanceof Uint8Array) {
        text = new TextDecoder('latin1').decode(decoded);
      } else if (typeof decoded === 'string') {
        text = decoded;
      } else {
        continue;
      }

      // Remove all BT...ET text blocks (non-greedy)
      // BT and ET are always at operator boundaries (preceded by whitespace or start of line)
      const cleaned = text.replace(/\bBT\b[\s\S]*?\bET\b/g, '\n');

      if (cleaned === text) continue; // Nothing changed

      // Create new uncompressed stream content
      const newBytes = new TextEncoder().encode(cleaned);

      // Build a new stream dict (remove FlateDecode filter since we write uncompressed)
      const newDict = pdfDoc.context.obj({
        Length: newBytes.length,
      });

      // Create new raw stream and replace in context
      const newStream = PDFLib.PDFRawStream.of(newDict, newBytes);
      pdfDoc.context.assign(ref, newStream);
    } catch (e) {
      console.warn('stripTextFromPage: failed to process stream:', e.message);
    }
  }
}

async function fetchFontBytes(relativePath) {
  const url = chrome.runtime.getURL(relativePath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font: ${relativePath} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function assemblePDF(originalArrayBuffer, translatedSegments, metadata) {
  if (!(originalArrayBuffer instanceof ArrayBuffer)) {
    throw new Error('Original PDF data is missing.');
  }
  if (typeof PDFLib === 'undefined' || !PDFLib.PDFDocument) {
    throw new Error('pdf-lib is not loaded.');
  }

  // Load original PDF
  const pdfDoc = await PDFLib.PDFDocument.load(cloneArrayBuffer(originalArrayBuffer), {
    ignoreEncryption: true,
  });

  // Embed fonts
  let regularFont, boldFont;
  try {
    if (typeof fontkit !== 'undefined') {
      pdfDoc.registerFontkit(fontkit);
    }
    const regularBytes = await fetchFontBytes('assets/fonts/NotoSans-Regular.ttf');
    const boldBytes = await fetchFontBytes('assets/fonts/NotoSans-Bold.ttf');
    regularFont = await pdfDoc.embedFont(regularBytes, { subset: true });
    boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });
  } catch (fontError) {
    console.warn('Custom font embedding failed, falling back to Helvetica:', fontError);
    regularFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  }

  const segmentsByPage = groupSegmentsByPage(translatedSegments);
  const pages = pdfDoc.getPages();

  for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
    const page = pages[pageNum - 1];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageSegments = segmentsByPage.get(pageNum) || [];
    const pageMeta = { width: pageWidth, height: pageHeight };

    // Remove all original text from the page content stream
    // This prevents original text from being copy-pasted
    try {
      stripTextFromPage(page, pdfDoc);
    } catch (e) {
      console.warn(`stripTextFromPage failed for page ${pageNum}:`, e.message);
    }

    // Draw ALL segments (both translated and skip-translated)
    for (const segment of pageSegments) {
      const isSkipped = !!segment.meta?.skipTranslation;
      const textToDraw = isSkipped
        ? String(segment.text || '').trim()
        : String(segment.translatedText || segment.text || '').trim();
      if (!textToDraw) continue;

      const activeFont = segment.meta?.style?.isBold ? boldFont : regularFont;

      // Pre-validate: try encoding text before drawing
      const linesToDraw = [];
      if (isSkipped) {
        // Skip-translated: draw original text directly at original position
        try {
          activeFont.encodeText(textToDraw);
          linesToDraw.push(textToDraw);
        } catch (e) {
          // Can't encode original text with our font — skip silently
          continue;
        }
      } else {
        // Translated: use layout computation
        const layout = computeTextLayout(
          textToDraw, segment, pageMeta, pageSegments, regularFont, boldFont
        );

        for (const line of layout.lines) {
          try {
            activeFont.encodeText(line);
            linesToDraw.push(line);
          } catch (e) {
            let cleaned = '';
            for (const ch of line) {
              try {
                activeFont.encodeText(ch);
                cleaned += ch;
              } catch (_) {
                cleaned += '?';
              }
            }
            if (cleaned && cleaned !== '?'.repeat(line.length)) {
              linesToDraw.push(cleaned);
            }
          }
        }

        if (!linesToDraw.length) {
          console.warn('Skipping segment — font cannot encode text:', textToDraw.slice(0, 50));
          continue;
        }

        // Draw translated text using computed layout
        let textY = layout.bbox.y + layout.bbox.height - layout.fontSize;
        for (const line of linesToDraw) {
          if (textY < layout.bbox.y - layout.lineHeight * 0.1) break;
          try {
            page.drawText(line, {
              x: layout.bbox.x,
              y: textY,
              size: layout.fontSize,
              font: activeFont,
              color: PDFLib.rgb(0, 0, 0),
            });
          } catch (e) {
            console.warn('Failed to draw text line:', e.message);
          }
          textY -= layout.lineHeight;
        }
        continue;
      }

      // Draw skip-translated text at original position
      const bbox = segment.meta?.bbox;
      if (bbox && linesToDraw.length) {
        const fontSize = segment.meta?.style?.fontSize || 10;
        try {
          page.drawText(linesToDraw[0], {
            x: bbox.x,
            y: bbox.y + bbox.height - fontSize,
            size: fontSize,
            font: activeFont,
            color: PDFLib.rgb(0, 0, 0),
          });
        } catch (e) {
          console.warn('Failed to draw skip-translated text:', e.message);
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// ═══════════════════════════════════════════════════════════════════
// Shared utilities
// ═══════════════════════════════════════════════════════════════════

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

function sanitizeXmlChars(value) {
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

// ═══════════════════════════════════════════════════════════════════
// Output helpers (text, HTML)
// ═══════════════════════════════════════════════════════════════════

/**
 * Build plain text output from translated segments, grouped by page.
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
