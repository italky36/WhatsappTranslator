// Unified parser interface for all supported file formats

/**
 * Parse a file and extract text segments for translation.
 * @param {File} file
 * @returns {Promise<{segments: Array, metadata: Object} | {error: string, message?: string}>}
 */
async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'docx':
      return parseWord(file);
    case 'pdf':
      return parsePDF(file);
    default:
      return { error: 'UNSUPPORTED_FORMAT', message: `Format .${extension} is not supported` };
  }
}

/**
 * Rebuild a file with translated segments.
 * @param {File} originalFile
 * @param {Array} translatedSegments - [{text, index, meta}]
 * @param {Object} options - parser-specific options
 * @param {Object} [options.workbook] - for Excel: original workbook
 * @param {string[]} [options.selectedSheets] - for Excel: sheets to translate
 * @param {ArrayBuffer} [options.arrayBuffer] - for Word: original file buffer
 * @param {Object} [options.metadata] - for PDF: file metadata
 * @returns {Promise<Blob | {textBlob: Blob, htmlContent: string}>}
 */
async function rebuildFile(originalFile, translatedSegments, options) {
  const extension = originalFile.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return rebuildExcel(options.workbook, translatedSegments, options.selectedSheets, options.metadata?.originalArrayBuffer);
    case 'docx':
      return rebuildWord(options.arrayBuffer, translatedSegments);
    case 'pdf': {
      const pdfBlob = await assemblePDF(
        options.metadata?.originalArrayBuffer,
        translatedSegments,
        options.metadata
      );
      const textContent = buildTranslatedText(translatedSegments, options.metadata);
      return {
        blob: pdfBlob,
        textBlob: new Blob(
          [textContent],
          { type: 'text/plain;charset=utf-8' }
        ),
        htmlContent: buildTranslatedHTML(translatedSegments, options.metadata),
      };
    }
    default:
      throw new Error(`Unsupported format: .${extension}`);
  }
}

/**
 * Get list of supported file extensions.
 * @returns {string[]}
 */
function getSupportedExtensions() {
  return ['.xlsx', '.xls', '.docx', '.pdf'];
}

/**
 * Get accept string for file input elements.
 * @returns {string}
 */
function getAcceptString() {
  return '.xlsx,.xls,.docx,.pdf';
}
