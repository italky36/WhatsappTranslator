// Word Parser (.docx)
// Uses JSZip for ZIP manipulation and DOMParser for XML parsing

/**
 * Parse a .docx file and extract text segments.
 * @param {File} file
 * @returns {Promise<{segments: Array, metadata: Object}>}
 */
async function parseWord(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(arrayBuffer);

  const segments = [];
  let index = 0;

  // Parse main document
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (docXml) {
    const parsed = extractSegmentsFromXml(docXml, 'document', index);
    segments.push(...parsed.segments);
    index = parsed.nextIndex;
  }

  // Parse headers
  for (const fileName of Object.keys(zip.files)) {
    if (/^word\/header\d+\.xml$/.test(fileName)) {
      const xml = await zip.file(fileName).async('string');
      const parsed = extractSegmentsFromXml(xml, fileName.replace('word/', ''), index);
      segments.push(...parsed.segments);
      index = parsed.nextIndex;
    }
  }

  // Parse footers
  for (const fileName of Object.keys(zip.files)) {
    if (/^word\/footer\d+\.xml$/.test(fileName)) {
      const xml = await zip.file(fileName).async('string');
      const parsed = extractSegmentsFromXml(xml, fileName.replace('word/', ''), index);
      segments.push(...parsed.segments);
      index = parsed.nextIndex;
    }
  }

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);

  return {
    segments,
    metadata: {
      type: 'docx',
      fileName: file.name,
      totalSegments: segments.length,
      totalChars,
      arrayBuffer,
    },
  };
}

/**
 * Extract text segments from an OOXML body.
 * Each <w:p> paragraph becomes one segment (text from all <w:t> runs concatenated).
 * Table cells <w:tc> are treated as separate segments.
 * @param {string} xml
 * @param {string} source - source identifier (e.g. 'document', 'header1.xml')
 * @param {number} startIndex
 * @returns {{segments: Array, nextIndex: number}}
 */
function extractSegmentsFromXml(xml, source, startIndex) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const segments = [];
  let index = startIndex;

  // Collect all paragraphs in document order
  const paragraphs = doc.getElementsByTagName('w:p');

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];

    // Check if this paragraph is inside a table cell
    const isInTable = para.parentNode && para.parentNode.nodeName === 'w:tc';

    // Get text from all runs in this paragraph
    const text = getParagraphText(para);

    if (!text || !text.trim()) continue;

    segments.push({
      text: text,
      index: index++,
      meta: {
        source,
        type: isInTable ? 'table-cell' : 'paragraph',
        paragraphIndex: pi,
      },
    });
  }

  return { segments, nextIndex: index };
}

/**
 * Get concatenated text from all <w:t> elements in a paragraph.
 * @param {Element} paragraph
 * @returns {string}
 */
function getParagraphText(paragraph) {
  const textNodes = paragraph.getElementsByTagName('w:t');
  let result = '';
  for (let i = 0; i < textNodes.length; i++) {
    result += textNodes[i].textContent || '';
  }
  return result;
}

/**
 * Rebuild a .docx file with translated text.
 * @param {ArrayBuffer} originalArrayBuffer
 * @param {Array} translatedSegments - [{text, index, meta}]
 * @returns {Promise<Blob>}
 */
async function rebuildWord(originalArrayBuffer, translatedSegments) {
  const zip = await JSZip.loadAsync(originalArrayBuffer);

  // Group segments by source file
  const segmentsBySource = {};
  for (const seg of translatedSegments) {
    const source = seg.meta.source;
    if (!segmentsBySource[source]) segmentsBySource[source] = [];
    segmentsBySource[source].push(seg);
  }

  // Process each source file
  for (const [source, segs] of Object.entries(segmentsBySource)) {
    const filePath = source === 'document' ? 'word/document.xml' : 'word/' + source;
    const xmlContent = await zip.file(filePath)?.async('string');
    if (!xmlContent) continue;

    const updatedXml = replaceTextInXml(xmlContent, segs);
    zip.file(filePath, updatedXml);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  return blob;
}

/**
 * Replace text in XML paragraphs based on translated segments.
 * Preserves formatting by keeping the first <w:r> run's properties and
 * setting all text into it, removing extra runs.
 * @param {string} xml
 * @param {Array} segments - sorted by paragraphIndex
 * @returns {string}
 */
function replaceTextInXml(xml, segments) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const paragraphs = doc.getElementsByTagName('w:p');

  // Build a map of paragraphIndex -> translated text
  const segMap = {};
  for (const seg of segments) {
    segMap[seg.meta.paragraphIndex] = seg.text;
  }

  for (const [piStr, newText] of Object.entries(segMap)) {
    const pi = parseInt(piStr, 10);
    if (pi >= paragraphs.length) continue;

    const para = paragraphs[pi];
    const runs = para.getElementsByTagName('w:r');

    if (runs.length === 0) continue;

    // Find the first run that contains a <w:t> element
    let firstTextRun = null;
    for (let i = 0; i < runs.length; i++) {
      const tElements = runs[i].getElementsByTagName('w:t');
      if (tElements.length > 0) {
        firstTextRun = runs[i];
        break;
      }
    }

    if (!firstTextRun) continue;

    // Set the translated text in the first text run's <w:t>
    const firstT = firstTextRun.getElementsByTagName('w:t')[0];
    setElementText(firstT, newText);
    // Preserve spaces
    firstT.setAttribute('xml:space', 'preserve');

    // Remove <w:t> from all other runs (keep run properties for formatting)
    const runsToClean = [];
    for (let i = 0; i < runs.length; i++) {
      if (runs[i] === firstTextRun) continue;
      runsToClean.push(runs[i]);
    }

    for (const run of runsToClean) {
      const tElements = run.getElementsByTagName('w:t');
      // Remove all text elements from non-first runs
      const toRemove = [];
      for (let i = 0; i < tElements.length; i++) {
        toRemove.push(tElements[i]);
      }
      for (const t of toRemove) {
        t.parentNode.removeChild(t);
      }
      // If the run has no content left (only properties), remove the run
      const hasContent = run.getElementsByTagName('w:t').length > 0 ||
                         run.getElementsByTagName('w:drawing').length > 0 ||
                         run.getElementsByTagName('w:br').length > 0 ||
                         run.getElementsByTagName('w:tab').length > 0;
      if (!hasContent) {
        // Check if there's only w:rPr left
        const children = run.childNodes;
        let onlyProps = true;
        for (let i = 0; i < children.length; i++) {
          if (children[i].nodeType === 1 && children[i].nodeName !== 'w:rPr') {
            onlyProps = false;
            break;
          }
        }
        if (onlyProps) {
          run.parentNode.removeChild(run);
        }
      }
    }
  }

  const serializer = new XMLSerializer();
  return ensureUtf8XmlDeclaration(serializer.serializeToString(doc));
}

function setElementText(element, value) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  element.appendChild(element.ownerDocument.createTextNode(String(value || '')));
}

function ensureUtf8XmlDeclaration(xml) {
  const sanitized = String(xml || '').replace(/^\uFEFF/, '');
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
  if (/^<\?xml/i.test(sanitized)) {
    return sanitized.replace(/^<\?xml[^>]*\?>/, declaration);
  }
  return declaration + sanitized;
}
