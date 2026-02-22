(function initDownloadManager(globalScope) {
  const MIME_TYPES = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain;charset=utf-8',
    zip: 'application/zip',
  };

  function getExtension(fileName) {
    if (!fileName || typeof fileName !== 'string') return '';
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex < 0) return '';
    return fileName.slice(dotIndex + 1).toLowerCase();
  }

  function getMimeTypeByFileName(fileName) {
    const extension = getExtension(fileName);
    if (extension === 'xlsx') return MIME_TYPES.xlsx;
    if (extension === 'docx') return MIME_TYPES.docx;
    if (extension === 'txt') return MIME_TYPES.txt;
    if (extension === 'zip') return MIME_TYPES.zip;
    return '';
  }

  function applyMimeType(blob, fileName) {
    if (!(blob instanceof Blob)) return null;
    const expectedMimeType = getMimeTypeByFileName(fileName);
    if (!expectedMimeType || blob.type === expectedMimeType) {
      return blob;
    }
    return new Blob([blob], { type: expectedMimeType });
  }

  function addUtf8Bom(blob) {
    if (!(blob instanceof Blob)) return null;
    return new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), blob], { type: MIME_TYPES.txt });
  }

  function downloadFile(blob, fileName) {
    if (!(blob instanceof Blob) || !fileName) return false;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  function buildPdfTextFromSegments(segments, metadata) {
    if (!Array.isArray(segments) || segments.length === 0) return '';

    const pages = {};
    for (const segment of segments) {
      const page = Number(segment?.meta?.page || 1);
      if (!pages[page]) pages[page] = [];
      pages[page].push(segment);
    }

    const maxPageFromMetadata = Number(metadata?.pageCount || 0);
    const maxPageFromSegments = Math.max(...Object.keys(pages).map((value) => Number(value) || 0));
    const pageCount = Math.max(1, maxPageFromMetadata, maxPageFromSegments);
    const lines = [];

    for (let page = 1; page <= pageCount; page++) {
      lines.push(`--- Page ${page} ---`);
      const pageSegments = (pages[page] || []).slice().sort((a, b) => {
        return Number(a?.meta?.blockIndex || 0) - Number(b?.meta?.blockIndex || 0);
      });
      for (const segment of pageSegments) {
        const text = String(segment?.translatedText || segment?.text || '').trim();
        if (text) {
          lines.push(text);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  function buildPdfDownloadBlob(result) {
    if (!result) return null;

    if (typeof result.textContent === 'string') {
      return addUtf8Bom(new Blob([result.textContent], { type: MIME_TYPES.txt }));
    }

    if (result.blob instanceof Blob) {
      return addUtf8Bom(new Blob([result.blob], { type: MIME_TYPES.txt }));
    }

    if (Array.isArray(result.segments)) {
      const textContent = buildPdfTextFromSegments(result.segments, result.metadata);
      return addUtf8Bom(new Blob([textContent], { type: MIME_TYPES.txt }));
    }

    return null;
  }

  function getResultPayload(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.result && typeof item.result === 'object') return item.result;
    if (item.translatedResult && typeof item.translatedResult === 'object') return item.translatedResult;
    return null;
  }

  function getItemStatus(item) {
    if (!item || typeof item !== 'object') return '';
    if (typeof item.status === 'string') return item.status;
    if (typeof item.translation?.status === 'string') return item.translation.status;
    return '';
  }

  function isSuccessfulStatus(status) {
    return status === 'completed' || status === 'partial';
  }

  function normalizeDownloadItem(item) {
    const result = getResultPayload(item);
    if (!result) return null;

    const fileName = result.fileName || item?.fileName;
    if (!fileName) return null;

    let blob = result.blob instanceof Blob ? result.blob : null;
    if (!blob) return null;

    const isPdfText = /\.txt$/i.test(fileName);
    if (isPdfText) {
      blob = buildPdfDownloadBlob(result);
    } else {
      blob = applyMimeType(blob, fileName);
    }

    if (!(blob instanceof Blob)) return null;

    return { fileName, blob };
  }

  function downloadResult(item) {
    const normalized = normalizeDownloadItem(item);
    if (!normalized) return false;
    return downloadFile(normalized.blob, normalized.fileName);
  }

  async function downloadAllAsZip(jobs, options = {}) {
    const list = Array.isArray(jobs) ? jobs : [];
    const successfulJobs = list.filter((item) => {
      return isSuccessfulStatus(getItemStatus(item));
    });

    const normalizedFiles = [];
    for (const job of successfulJobs) {
      const normalized = normalizeDownloadItem(job);
      if (normalized) {
        normalizedFiles.push(normalized);
      }
    }

    if (!normalizedFiles.length) {
      if (typeof options.onNoFiles === 'function') {
        options.onNoFiles();
      }
      return { downloaded: false, count: 0 };
    }

    if (typeof globalScope.JSZip !== 'function') {
      throw new Error('JSZip is not available');
    }

    if (typeof options.onStart === 'function') {
      options.onStart({ count: normalizedFiles.length });
    }

    const zip = new globalScope.JSZip();
    const totalSizeBytes = normalizedFiles.reduce((sum, file) => sum + Number(file.blob?.size || 0), 0);
    const useStoreCompression = totalSizeBytes > 10 * 1024 * 1024;
    for (const file of normalizedFiles) {
      zip.file(file.fileName, file.blob);
    }

    const zipOptions = {
      type: 'blob',
      compression: useStoreCompression ? 'STORE' : 'DEFLATE',
    };
    if (!useStoreCompression) {
      zipOptions.compressionOptions = { level: 6 };
    }

    const zipBlob = await zip.generateAsync(
      zipOptions,
      (metadata) => {
        if (typeof options.onProgress === 'function') {
          options.onProgress(metadata);
        }
      }
    );

    const timestamp = new Date().toISOString().slice(0, 10);
    const zipFileName = `translations_${timestamp}.zip`;
    const normalizedZipBlob = applyMimeType(zipBlob, zipFileName);
    const downloaded = downloadFile(normalizedZipBlob, zipFileName);

    if (typeof options.onComplete === 'function') {
      options.onComplete({ downloaded, count: normalizedFiles.length, fileName: zipFileName });
    }

    return { downloaded, count: normalizedFiles.length, fileName: zipFileName };
  }

  globalScope.DownloadManager = {
    MIME_TYPES,
    addUtf8Bom,
    buildPdfDownloadBlob,
    downloadFile,
    downloadResult,
    downloadAllAsZip,
  };
})(window);
