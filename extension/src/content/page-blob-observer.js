(() => {
  if (window.__wtBlobObserverInstalled) return;
  window.__wtBlobObserverInstalled = true;

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
})();
