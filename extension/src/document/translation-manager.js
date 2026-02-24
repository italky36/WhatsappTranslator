(function initTranslationManager(globalScope) {
  class TranslationError extends Error {
    constructor(code, message, data = {}) {
      super(message);
      this.name = 'TranslationError';
      this.code = code || 'TRANSLATION_FAILED';
      this.data = data;
    }
  }

  class TranslationManager {
    constructor(sendMessageFn) {
      this.sendMessage = sendMessageFn;
      this.jobs = [];
      this.onProgress = null;
      this.onJobComplete = null;
      this.onJobError = null;
      this.onAllComplete = null;
      this.onRetry = null;

      this.isRunning = false;
      this.isCancelled = false;
      this._jobIdCounter = 0;
    }

    addJob(file, options = {}) {
      const jobId = ++this._jobIdCounter;
      this.jobs.push({
        id: jobId,
        file,
        options,
        status: 'queued',
        progress: { phase: 'waiting', percent: 0 },
        result: null,
        error: null,
      });
      return jobId;
    }

    async startAll(sourceLang, targetLang) {
      if (this.isRunning) {
        throw new TranslationError('ALREADY_RUNNING', 'Translation queue is already running');
      }

      this.isRunning = true;
      this.isCancelled = false;
      const results = [];

      try {
        for (const job of this.jobs) {
          if (this.isCancelled) break;
          if (job.status !== 'queued') continue;

          try {
            const result = await this.processJob(job, sourceLang, targetLang);
            results.push({ jobId: job.id, status: job.status, result });
            this._emit(this.onJobComplete, job.id, result);

            if (job.status === 'partial' && job.error?.code === 'LIMIT_EXCEEDED') {
              this._stopRemainingAfterLimit();
              break;
            }
          } catch (error) {
            const normalized = this._normalizeError(error);
            job.error = normalized;
            if (normalized.code === 'CANCELLED') {
              job.status = 'cancelled';
              job.progress = { phase: 'error', percent: Math.max(0, job.progress?.percent || 0) };
            } else {
              job.status = 'error';
              job.progress = { phase: 'error', percent: 100 };
            }
            this._emit(this.onProgress, job.id, job.progress);
            this._emit(this.onJobError, job.id, normalized);
            results.push({ jobId: job.id, status: job.status, error: normalized, result: job.result });

            if (normalized.code === 'CANCELLED') {
              break;
            }

            if (normalized.code === 'LIMIT_EXCEEDED') {
              this._stopRemainingAfterLimit();
              break;
            }
          }
        }
      } finally {
        if (this.isCancelled) {
          this._markQueuedJobsCancelled();
        }

        this.isRunning = false;
        this._emit(this.onAllComplete, results);
      }
    }

    cancel() {
      this.isCancelled = true;
    }

    getJobStatus(jobId) {
      const job = this.jobs.find((item) => item.id === jobId);
      if (!job) return null;
      return {
        status: job.status,
        progress: { ...job.progress },
        result: job.result,
        error: job.error,
      };
    }

    async processJob(job, sourceLang, targetLang) {
      this._throwIfCancelled();

      job.status = 'parsing';
      job.progress = { phase: 'parsing', percent: 0 };
      this._emit(this.onProgress, job.id, job.progress);

      const parseResult = await parseFile(job.file);
      if (parseResult?.error) {
        throw new TranslationError(parseResult.error, parseResult.message || parseResult.error);
      }

      const segments = Array.isArray(parseResult?.segments) ? parseResult.segments : [];
      const metadata = parseResult?.metadata || {};

      job.progress = { phase: 'parsing', percent: 10 };
      this._emit(this.onProgress, job.id, job.progress);

      let filteredSegments = segments;
      if ((metadata.type === 'xlsx' || metadata.type === 'xls') && Array.isArray(job.options.selectedSheets)) {
        const allowedSheets = new Set(job.options.selectedSheets);
        filteredSegments = segments.filter((segment) => allowedSheets.has(segment?.meta?.sheet));
      }
      if (metadata.type === 'pdf') {
        filteredSegments = filteredSegments.filter((segment) => !segment?.meta?.skipTranslation);
      }

      this._throwIfCancelled();
      job.status = 'translating';
      job.progress = { phase: 'translating', percent: 10 };
      this._emit(this.onProgress, job.id, job.progress);

      let translationResponse;
      try {
        translationResponse = await this.translateSegments(filteredSegments, sourceLang, targetLang, (percent) => {
          job.progress = { phase: 'translating', percent: Math.max(10, Math.min(90, 10 + percent)) };
          this._emit(this.onProgress, job.id, job.progress);
        }, job.id);
      } catch (error) {
        const normalized = this._normalizeError(error);
        const translatedSoFar = Array.isArray(normalized?.data?.translatedSoFar)
          ? normalized.data.translatedSoFar
          : [];

        if ((normalized.code === 'LIMIT_EXCEEDED' || normalized.code === 'NETWORK_ERROR') && translatedSoFar.length > 0) {
          const partialSegments = this._buildMergedSegments(filteredSegments, translatedSoFar);
          const partialBlob = await rebuildFile(job.file, partialSegments, {
            workbook: metadata.workbook,
            arrayBuffer: metadata.arrayBuffer,
            selectedSheets: job.options.selectedSheets,
            metadata,
          });

          job.status = 'partial';
          job.error = normalized;
          job.progress = { phase: 'partial', percent: 100 };
          job.result = {
            blob: partialBlob?.blob || partialBlob?.textBlob || partialBlob,
            htmlContent: partialBlob?.htmlContent || null,
            fileName: generateOutputFileName(job.file.name),
            segments: partialSegments,
            metadata,
            totalChars: partialSegments.reduce((sum, seg) => sum + String(seg.text || '').length, 0),
            partial: {
              translated: translatedSoFar.length,
              total: filteredSegments.length,
            },
          };

          this._emit(this.onProgress, job.id, job.progress);
          this._emit(this.onJobError, job.id, normalized);
          return job.result;
        }

        throw normalized;
      }

      this._throwIfCancelled();
      job.status = 'rebuilding';
      job.progress = { phase: 'rebuilding', percent: 95 };
      this._emit(this.onProgress, job.id, job.progress);

      const translatedSegments = translationResponse.segments;
      const resultBlob = await rebuildFile(job.file, translatedSegments, {
        workbook: metadata.workbook,
        arrayBuffer: metadata.arrayBuffer,
        selectedSheets: job.options.selectedSheets,
        metadata,
      });

      job.status = 'completed';
      job.progress = { phase: 'done', percent: 100 };
      job.result = {
        blob: resultBlob?.blob || resultBlob?.textBlob || resultBlob,
        htmlContent: resultBlob?.htmlContent || null,
        fileName: generateOutputFileName(job.file.name),
        segments: translatedSegments,
        metadata,
        detectedSourceLang: translationResponse.detectedSourceLang || null,
        totalChars: translatedSegments.reduce((sum, seg) => sum + String(seg.text || '').length, 0),
      };

      this._emit(this.onProgress, job.id, job.progress);
      return job.result;
    }

    async translateSegments(segments, sourceLang, targetLang, onProgress, jobId) {
      const BATCH_SIZE = 50;

      if (!segments.length) {
        onProgress(80);
        return { segments: [], detectedSourceLang: null };
      }

      const batches = [];
      for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        batches.push(segments.slice(i, i + BATCH_SIZE));
      }

      const allResults = [];
      let completedSegments = 0;
      let detectedSourceLang = null;

      for (const batch of batches) {
        this._throwIfCancelled();

        let response;
        try {
          response = await this._translateBatchWithRetry(batch, sourceLang, targetLang, jobId);
        } catch (error) {
          const normalized = this._normalizeError(error);
          if (normalized.code === 'LIMIT_EXCEEDED' || normalized.code === 'NETWORK_ERROR') {
            normalized.data = {
              ...normalized.data,
              translatedSoFar: allResults.slice(),
            };
          }
          throw normalized;
        }

        if (response.detectedSourceLang && !detectedSourceLang) {
          detectedSourceLang = response.detectedSourceLang;
        }

        const sourceByIndex = new Map(batch.map((seg) => [seg.index, seg]));
        const batchResults = Array.isArray(response.results) ? response.results : [];

        for (let i = 0; i < batchResults.length; i++) {
          const item = batchResults[i] || {};
          const resolvedIndex = Number.isFinite(item.index) ? item.index : batch[i]?.index;
          if (!Number.isFinite(resolvedIndex)) continue;

          const original = sourceByIndex.get(resolvedIndex) || batch[i];
          const translatedText = String(item.translatedText || '');
          allResults.push({
            index: resolvedIndex,
            translatedText,
            text: translatedText,
            meta: original?.meta || null,
          });
        }

        completedSegments += batch.length;
        onProgress(Math.round((completedSegments / segments.length) * 80));
      }

      allResults.sort((a, b) => a.index - b.index);
      const mergedSegments = this._buildMergedSegments(segments, allResults);
      return {
        segments: mergedSegments,
        detectedSourceLang,
      };
    }

    async _translateBatchWithRetry(batch, sourceLang, targetLang, jobId) {
      const payload = {
        type: 'TRANSLATE_BATCH',
        data: {
          segments: batch.map((segment) => ({ text: segment.text, index: segment.index })),
          source: sourceLang,
          target: targetLang,
        },
      };

      let attempt = 0;
      while (true) {
        this._throwIfCancelled();
        attempt += 1;

        try {
          const response = await this.sendMessage(payload);
          if (response?.success) {
            return response;
          }

          throw this._extractResponseError(response);
        } catch (error) {
          const normalized = this._normalizeError(error);
          const delayMs = this._getRetryDelayMs(normalized.code, attempt);
          if (delayMs === null) throw normalized;

          this._emit(this.onRetry, jobId, {
            code: normalized.code,
            attempt,
            delayMs,
            message: normalized.message,
          });
          await this._sleep(delayMs);
        }
      }
    }

    _extractResponseError(response) {
      const rawError = response?.error;

      if (rawError && typeof rawError === 'object') {
        return new TranslationError(
          rawError.code || 'TRANSLATION_FAILED',
          rawError.message || 'Translation failed',
          rawError.details ? { details: rawError.details } : {}
        );
      }

      if (typeof rawError === 'string') {
        const code = /network|failed to fetch|connection|timeout|econn|enotfound/i.test(rawError)
          ? 'NETWORK_ERROR'
          : 'TRANSLATION_FAILED';
        return new TranslationError(code, rawError);
      }

      return new TranslationError('TRANSLATION_FAILED', 'Unknown translation error');
    }

    _normalizeError(error) {
      if (error instanceof TranslationError) return error;

      if (error && typeof error === 'object' && error.code) {
        return new TranslationError(error.code, error.message || error.code, error.data || {});
      }

      const message = error?.message || String(error || 'Unknown error');
      const code = /network|failed to fetch|connection|timeout|econn|enotfound/i.test(message)
        ? 'NETWORK_ERROR'
        : 'TRANSLATION_FAILED';
      return new TranslationError(code, message);
    }

    _getRetryDelayMs(code, attempt) {
      if (code === 'TRANSLATION_FAILED') {
        return attempt < 2 ? 700 : null;
      }

      if (code === 'NETWORK_ERROR') {
        if (attempt === 1) return 1000;
        if (attempt === 2) return 3000;
      }

      return null;
    }

    _buildMergedSegments(originalSegments, translatedSegments) {
      const translatedMap = new Map();
      for (const segment of translatedSegments) {
        translatedMap.set(segment.index, segment);
      }

      return originalSegments.map((segment) => {
        const translated = translatedMap.get(segment.index);
        const translatedText = translated ? String(translated.translatedText || translated.text || '') : String(segment.text || '');
        return {
          ...segment,
          translatedText,
          text: translatedText,
          isTranslated: Boolean(translated),
        };
      });
    }

    _stopRemainingAfterLimit() {
      for (const job of this.jobs) {
        if (job.status !== 'queued') continue;
        job.status = 'error';
        job.error = new TranslationError('LIMIT_EXCEEDED', 'Translation stopped because character limit was exceeded');
        job.progress = { phase: 'error', percent: 0 };
        this._emit(this.onProgress, job.id, job.progress);
        this._emit(this.onJobError, job.id, job.error);
      }
    }

    _markQueuedJobsCancelled() {
      for (const job of this.jobs) {
        if (job.status !== 'queued') continue;
        job.status = 'cancelled';
        job.error = new TranslationError('CANCELLED', 'Translation cancelled');
        job.progress = { phase: 'error', percent: 0 };
        this._emit(this.onProgress, job.id, job.progress);
        this._emit(this.onJobError, job.id, job.error);
      }
    }

    _throwIfCancelled() {
      if (this.isCancelled) {
        throw new TranslationError('CANCELLED', 'Translation cancelled');
      }
    }

    _emit(callback, ...args) {
      if (typeof callback !== 'function') return;
      callback(...args);
    }

    _sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  function generateOutputFileName(originalName) {
    const dotIndex = originalName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return `${originalName}_translated`;
    }

    const name = originalName.slice(0, dotIndex);
    const extension = originalName.slice(dotIndex);
    const lowerExt = extension.toLowerCase();

    if (lowerExt === '.pdf') {
      return `${name}_translated.pdf`;
    }

    if (lowerExt === '.xls') {
      return `${name}_translated.xlsx`;
    }

    return `${name}_translated${extension}`;
  }

  globalScope.TranslationManager = TranslationManager;
  globalScope.TranslationError = TranslationError;
  globalScope.generateOutputFileName = generateOutputFileName;
})(window);
