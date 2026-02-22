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
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = pdf.numPages;

  const segments = [];
  let index = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const blocks = buildTextBlocks(textContent.items, pageNum);

    for (const block of blocks) {
      if (!block.text.trim()) continue;

      segments.push({
        text: block.text,
        index: index++,
        meta: {
          page: pageNum,
          blockIndex: block.blockIndex,
        },
      });
    }
  }

  if (!segments.length) {
    return { error: 'NO_TEXT_LAYER' };
  }

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
    },
  };
}

/**
 * Build logical text blocks from PDF text items.
 * Groups items into blocks separated by EOL markers or large vertical gaps.
 * @param {Array} items - PDF.js text content items
 * @param {number} pageNum
 * @returns {Array<{text: string, blockIndex: number}>}
 */
function buildTextBlocks(items, pageNum) {
  const blocks = [];
  let currentText = '';
  let blockIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const normalized = normalizePdfText(item.str);

    if (!normalized && !item.hasEOL) continue;

    currentText += normalized || '';

    // Check if this is end of a block (EOL or last item)
    if (item.hasEOL || i === items.length - 1) {
      // Look ahead: if next item exists and has a significant gap, flush block
      const nextItem = items[i + 1];
      const isEndOfBlock = !nextItem ||
        item.hasEOL && (!nextItem.str || nextItem.str === '' ||
          // Double EOL indicates paragraph break
          (i + 1 < items.length && items[i + 1].hasEOL));

      if (isEndOfBlock && currentText.trim()) {
        blocks.push({
          text: currentText.trim(),
          blockIndex: blockIndex++,
        });
        currentText = '';
      } else if (item.hasEOL) {
        currentText += ' ';
      }
    }
  }

  // Flush remaining text
  if (currentText.trim()) {
    blocks.push({
      text: currentText.trim(),
      blockIndex: blockIndex++,
    });
  }

  return blocks;
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
 * Build a .docx Blob from translated PDF segments using JSZip.
 * Produces a minimal valid .docx with paragraphs and page breaks.
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {Promise<Blob>}
 */
async function buildTranslatedDocx(translatedSegments, metadata) {
  const pages = {};
  for (const seg of translatedSegments) {
    const page = Number(seg.meta?.page || 1);
    if (!pages[page]) pages[page] = [];
    pages[page].push(seg);
  }

  const maxPageMeta = Number(metadata?.pageCount || 0);
  const maxPageSeg = Math.max(...Object.keys(pages).map(Number), 0);
  const pageCount = Math.max(1, maxPageMeta, maxPageSeg);

  // Build document.xml body paragraphs
  let bodyXml = '';
  for (let p = 1; p <= pageCount; p++) {
    // Page break before each page (except first)
    if (p > 1) {
      bodyXml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }

    // Page header
    bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${_escapeDocxXml('— Page ' + p + ' —')}</w:t></w:r></w:p>`;

    const pageSegments = (pages[p] || []).slice().sort((a, b) =>
      Number(a?.meta?.blockIndex || 0) - Number(b?.meta?.blockIndex || 0)
    );

    for (const seg of pageSegments) {
      const text = String(seg?.translatedText || seg?.text || '').trim();
      if (!text) continue;
      bodyXml += `<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${_escapeDocxXml(text)}</w:t></w:r></w:p>`;
    }
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
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>' +
    '<w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/><w:color w:val="2E74B5"/></w:rPr></w:style>' +
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

  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function _escapeDocxXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build plain text output from translated segments, grouped by page.
 * @param {Array} translatedSegments
 * @param {Object} metadata
 * @returns {string}
 */
function buildTranslatedText(translatedSegments, metadata) {
  const pages = {};

  for (const seg of translatedSegments) {
    const page = seg.meta.page;
    if (!pages[page]) pages[page] = [];
    pages[page].push(seg);
  }

  const lines = [];
  const pageCount = metadata.pageCount || Math.max(...Object.keys(pages).map(Number));

  for (let p = 1; p <= pageCount; p++) {
    lines.push(`--- Page ${p} ---`);
    const pageSegments = pages[p] || [];
    pageSegments.sort((a, b) => a.meta.blockIndex - b.meta.blockIndex);
    for (const seg of pageSegments) {
      lines.push(seg.text);
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
  const pages = {};

  for (const seg of translatedSegments) {
    const page = seg.meta.page;
    if (!pages[page]) pages[page] = [];
    pages[page].push(seg);
  }

  const pageCount = metadata.pageCount || Math.max(...Object.keys(pages).map(Number));
  let html = '';

  for (let p = 1; p <= pageCount; p++) {
    html += `<div class="pdf-page"><h3>Page ${p}</h3>`;
    const pageSegments = pages[p] || [];
    pageSegments.sort((a, b) => a.meta.blockIndex - b.meta.blockIndex);
    for (const seg of pageSegments) {
      const escaped = seg.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html += `<p>${escaped}</p>`;
    }
    html += '</div>';
  }

  return html;
}
