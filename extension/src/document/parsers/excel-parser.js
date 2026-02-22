// Excel Parser (.xlsx / .xls)
// Uses SheetJS (XLSX global) for reading and JSZip for style-preserving rebuild

/**
 * Parse an Excel file and extract text segments.
 * @param {File} file
 * @returns {Promise<{segments: Array, metadata: Object}>}
 */
async function parseExcel(file) {
  const data = await readFileAsArrayBuffer(file);
  const isXls = file.name.toLowerCase().endsWith('.xls');
  const readOptions = { type: 'array', cellStyles: true };
  if (isXls) {
    readOptions.codepage = 65001;
  }
  const workbook = XLSX.read(data, readOptions);

  const segments = [];
  const sheetsInfo = [];
  let index = 0;
  let totalCellCount = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    totalCellCount += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
  }
  const shouldYield = totalCellCount > 5000;
  let processedCells = 0;

  // Collect merged cell ranges per sheet for lookup
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const merges = sheet['!merges'] || [];
    const mergedSecondary = new Set();

    // Mark all non-origin cells in merged ranges
    for (const merge of merges) {
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (r !== merge.s.r || c !== merge.s.c) {
            mergedSecondary.add(XLSX.utils.encode_cell({ r, c }));
          }
        }
      }
    }

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    let rowCount = range.e.r - range.s.r + 1;
    let colCount = range.e.c - range.s.c + 1;

    sheetsInfo.push({ name: sheetName, rowCount, colCount });

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        processedCells += 1;
        if (shouldYield && processedCells % 1500 === 0) {
          await yieldToMainThread();
        }

        const cellAddress = XLSX.utils.encode_cell({ r, c });

        // Skip secondary merged cells
        if (mergedSecondary.has(cellAddress)) continue;

        const cell = sheet[cellAddress];
        if (!cell) continue;

        // Skip non-string cells (numbers, booleans, errors)
        if (cell.t !== 's') continue;

        // Skip cells with formulas
        if (cell.f) continue;

        const text = cell.v;

        // Skip empty or whitespace-only cells
        if (!text || (typeof text === 'string' && !text.trim())) continue;

        segments.push({
          text: String(text),
          index: index++,
          meta: {
            sheet: sheetName,
            cell: cellAddress,
            row: r,
            col: c,
          },
        });
      }
    }
  }

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);

  return {
    segments,
    metadata: {
      type: isXls ? 'xls' : 'xlsx',
      fileName: file.name,
      sheets: sheetsInfo,
      totalSegments: segments.length,
      totalChars,
      isLargeWorkbook: shouldYield,
      workbook,
      originalArrayBuffer: data, // kept for style-preserving rebuild via JSZip
    },
  };
}

/**
 * Get sheet names from a workbook.
 * @param {Object} workbook - XLSX.WorkBook
 * @returns {string[]}
 */
function getSheetNames(workbook) {
  return workbook.SheetNames.slice();
}

/**
 * Rebuild an Excel file with translated text, preserving all styles via ExcelJS.
 *
 * ExcelJS reads the original file (keeping styles, merges, formatting),
 * then we replace only the cell values with translated text.
 *
 * @param {Object} originalWorkbook - XLSX.WorkBook from parseExcel (used only as fallback)
 * @param {Array} translatedSegments - [{text, index, meta: {sheet, cell, row, col}}]
 * @param {string[]} [selectedSheets] - sheets to translate (all if omitted)
 * @param {ArrayBuffer} [originalArrayBuffer] - original file bytes for ExcelJS
 * @returns {Promise<Blob>}
 */
async function rebuildExcel(originalWorkbook, translatedSegments, selectedSheets, originalArrayBuffer) {
  const selectedSet = selectedSheets ? new Set(selectedSheets) : null;

  // --- Always update SheetJS workbook cells (used by preview) ---
  for (const seg of translatedSegments) {
    if (!seg.meta) continue;
    const { sheet, cell } = seg.meta;
    if (selectedSet && !selectedSet.has(sheet)) continue;

    const ws = originalWorkbook.Sheets[sheet];
    if (!ws) continue;

    const cellObj = ws[cell];
    if (cellObj) {
      cellObj.v = seg.text;
      delete cellObj.w;
    }
  }

  // --- Try ExcelJS approach (preserves styles) ---
  if (originalArrayBuffer && typeof ExcelJS !== 'undefined') {
    try {
      const styledBlob = await _rebuildViaExcelJS(originalArrayBuffer, translatedSegments, selectedSet);
      if (styledBlob) return styledBlob;
    } catch (e) {
      console.error('ExcelJS style-preserving rebuild failed, using SheetJS fallback:', e);
    }
  }

  // --- Fallback: SheetJS output (translated text, but no styles) ---
  const output = XLSX.write(originalWorkbook, { type: 'array', bookType: 'xlsx' });
  return new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Use ExcelJS to load the original file (preserving styles), replace cell values,
 * and write back with all formatting intact.
 * @returns {Promise<Blob|null>}
 */
async function _rebuildViaExcelJS(originalArrayBuffer, translatedSegments, selectedSet) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(originalArrayBuffer);

  let replacedCount = 0;

  for (const seg of translatedSegments) {
    if (!seg.meta) continue;
    const { sheet: sheetName, row, col } = seg.meta;
    if (selectedSet && !selectedSet.has(sheetName)) continue;

    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) continue;

    // ExcelJS rows/cols are 1-based, SheetJS stores 0-based
    const excelRow = row + 1;
    const excelCol = col + 1;

    const cell = worksheet.getCell(excelRow, excelCol);

    // Preserve rich text structure if present, otherwise set plain value
    if (cell.value && typeof cell.value === 'object' && cell.value.richText) {
      // Rich text cell — replace with plain text but keep cell style
      cell.value = String(seg.text || '');
    } else {
      cell.value = String(seg.text || '');
    }

    replacedCount++;
  }

  if (replacedCount === 0) return null;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Helper: read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function yieldToMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
