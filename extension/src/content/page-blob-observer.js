(() => {
  if (window.__wtBlobObserverInstalled) return;
  window.__wtBlobObserverInstalled = true;

  // ── Hook URL.createObjectURL to capture blob URLs ──
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(...args) {
    const url = originalCreateObjectURL(...args);
    try {
      const blob = args && args[0];
      if (blob && typeof blob === 'object' && typeof blob.size === 'number') {
        window.postMessage({
          __wtBlobObserver: true,
          type: 'blob-created',
          url,
          mimeType: String(blob.type || ''),
          size: Number(blob.size || 0),
          ts: Date.now(),
        }, '*');
      }
    } catch {}
    return url;
  };

  // ── Download interception ──
  // When content script sets the flag, we intercept the next <a download> click
  // to prevent actual file download while capturing the blob URL.

  let interceptNextDownload = false;
  let interceptResetTimer = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__wtBlobObserver !== true) return;
    if (data.type !== 'set-intercept-download') return;

    interceptNextDownload = true;
    if (interceptResetTimer) clearTimeout(interceptResetTimer);
    interceptResetTimer = setTimeout(() => {
      interceptNextDownload = false;
      interceptResetTimer = null;
    }, 5000);
  }, true);

  function notifyDownloadIntercepted(href, fileName) {
    interceptNextDownload = false;
    if (interceptResetTimer) {
      clearTimeout(interceptResetTimer);
      interceptResetTimer = null;
    }
    window.postMessage({
      __wtBlobObserver: true,
      type: 'download-intercepted',
      url: href,
      fileName: fileName || '',
      ts: Date.now(),
    }, '*');
  }

  // Intercept DOM click events on <a download> (capture phase)
  document.addEventListener('click', (event) => {
    if (!interceptNextDownload) return;
    const target = event.target;
    if (!target) return;

    const anchor = (target.tagName === 'A' && target.hasAttribute('download'))
      ? target
      : target.closest?.('a[download]');
    if (!anchor) return;

    const href = anchor.href || '';
    if (!href.startsWith('blob:')) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    notifyDownloadIntercepted(href, anchor.getAttribute('download'));
  }, true);

  // Hook HTMLAnchorElement.prototype.click to catch programmatic clicks
  // WhatsApp may create <a download> in JS, set href, and call .click() directly
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (interceptNextDownload && this.hasAttribute('download')) {
      const href = this.href || '';
      if (href.startsWith('blob:')) {
        notifyDownloadIntercepted(href, this.getAttribute('download'));
        return; // skip actual download
      }
    }
    return originalAnchorClick.call(this);
  };
})();
