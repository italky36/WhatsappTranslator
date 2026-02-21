// WhatsApp Translator - Content Script

(function() {
  'use strict';

  // State
  let settings = null;
  let isAuthenticated = false;
  let translatedMessages = new Map(); // LRU cache
  const MAX_CACHE_SIZE = 2000;

  // Outgoing translate state
  let isSending = false;
  let bypassNextSend = false;
  let sendHookInterval = null;
  let lastSentTranslation = null; // { original, translated, timestamp }

  // i18n for floating widget
  let uiLang = 'en';
  const widgetI18n = {
    en: {
      header: 'Translator',
      autoTranslate: 'Translate incoming',
      sendTranslation: 'Translate outgoing',
      hideWidget: 'Hide widget',
      incoming: 'Incoming',
      outgoing: 'Outgoing',
      translating: 'Translating...',
    },
    ru: {
      header: 'Переводчик',
      autoTranslate: 'Перевод входящих',
      sendTranslation: 'Перевод исходящих',
      hideWidget: 'Скрыть виджет',
      incoming: 'Входящие',
      outgoing: 'Исходящие',
      translating: 'Переводим...',
    },
  };

  function wt(key) {
    return widgetI18n[uiLang]?.[key] || widgetI18n.en[key] || key;
  }
  
  // Initialize
  init();

  async function init() {
    // Check auth status
    const status = await sendMessage({ type: 'GET_AUTH_STATUS' });
    isAuthenticated = status.authenticated;
    
    if (!isAuthenticated) {
      console.log('WhatsApp Translator: Not authenticated');
      return;
    }
    
    // Load settings and UI language
    settings = await sendMessage({ type: 'GET_SETTINGS' });
    const stored = await chrome.storage.local.get('uiLanguage');
    if (stored.uiLanguage) uiLang = stored.uiLanguage;

    // Create floating widget
    createFloatingWidget();

    // Start observing / scanning incoming messages
    startIncomingTranslation();

    // Hook outgoing send (WATransChat-style)
    startSendHooks();

    // Optional: keep translate button (uses same send flow)
    injectTranslateButton();

    console.log('WhatsApp Translator: Initialized');
  }

  // Communication with background
  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  // Listen for settings and language updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SETTINGS_UPDATED') {
      settings = message.settings;
      updateFloatingWidget();
    }
    if (message.type === 'UI_LANGUAGE_CHANGED') {
      uiLang = message.lang;
      applyWidgetLanguage();
    }
  });

  // Generate message key for deduplication
  function generateMessageKey(chatId, direction, text, messageId) {
    const data = `${chatId}|${direction}|${messageId || ''}|${text}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // Add to cache with LRU eviction
  function addToCache(key, translation) {
    if (translatedMessages.size >= MAX_CACHE_SIZE) {
      const firstKey = translatedMessages.keys().next().value;
      translatedMessages.delete(firstKey);
    }
    translatedMessages.set(key, translation);
  }

  // Get current chat ID (simplified)
  function getCurrentChatId() {
    const header = document.querySelector('[data-testid="conversation-header"]');
    if (header) {
      const name = header.querySelector('span[dir="auto"]');
      return name?.textContent || 'unknown';
    }
    return 'unknown';
  }

  // Message container / scroll helpers (WATransChat-style)
  function findMessagesRoot() {
    return document.querySelector('div[data-scrolltracepolicy="wa.web.conversation.messages"]') ||
      document.querySelector('[data-testid="conversation-panel-body"]') ||
      document.querySelector('#main [role="region"][tabindex="-1"]') ||
      document.querySelector('#main') ||
      document.scrollingElement ||
      document.documentElement ||
      document.body;
  }

  function findScrollContainer(start) {
    try {
      let node = start && start.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight - node.clientHeight > 2) {
          return node;
        }
        node = node.parentElement;
      }
    } catch {}
    return findMessagesRoot();
  }

  function isNearBottom(container, threshold = 160) {
    try {
      return container.scrollHeight - container.clientHeight - container.scrollTop <= threshold;
    } catch {
      return true;
    }
  }

  function scrollToBottom(container) {
    try {
      const setScroll = () => { container.scrollTop = container.scrollHeight; };
      requestAnimationFrame(() => {
        setScroll();
        requestAnimationFrame(() => {
          setScroll();
          setTimeout(setScroll, 0);
        });
      });
    } catch {}
  }

  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
  }

  function findMessageRowFromTextSpan(span) {
    if (!span) return null;
    let row = span.closest('[data-id][role="row"]') || span.closest('[role="row"]');

    if (!row) {
      row = span.closest('.copyable-text')?.parentElement?.parentElement || null;
    }

    if (!row) {
      let node = span.parentElement;
      let depth = 0;
      const limit = 8;
      while (node && node !== document.body && depth < limit) {
        if (node.tagName === 'DIV') {
          const rect = node.getBoundingClientRect();
          if (rect.height > 0 && rect.height < 800 && rect.width > 50 && rect.width < 1200 &&
              (node.querySelector('[data-testid="selectable-text"]') ||
               node.getAttribute('data-id') ||
               node.querySelector('[role="row"]'))) {
            row = node;
            break;
          }
        }
        node = node.parentElement;
        depth += 1;
      }
    }

    if (!row) {
      row = span.closest('div.message-in') ||
            span.closest('div._amk6._amlo') ||
            span.closest('div[class*="message-in"]');
    }

    if (!row) {
      let node = span.parentElement;
      while (node && node !== document.body) {
        if (node.tagName === 'DIV' && node.classList && node.classList.length > 0) {
          const rect = node.getBoundingClientRect();
          const hasTime = /\\d{1,2}:\\d{2}/.test(node.textContent || '') ||
            node.querySelector('[class*="time"], [class*="Time"]') ||
            node.querySelector('[data-testid="selectable-text"]');
          if (rect.height > 20 && rect.height < 500 && rect.width > 100 && hasTime) {
            row = node;
            break;
          }
        }
        node = node.parentElement;
      }
    }

    return row;
  }

  function findMessageTextContainerFromSpan(span) {
    return span.closest('[data-testid="msg-text"]') ||
      span.closest('div.copyable-text') ||
      span.closest('div');
  }

  function isOutgoingMessage(row) {
    if (!row) return false;
    if (row.classList.contains('message-out')) return true;
    if (row.closest('div.message-out')) return true;
    if (row.closest('div[class*="message-out"]')) return true;
    if (row.querySelector('[data-testid="msg-dblcheck"]')) return true;
    return false;
  }

  function scanVisibleMessages() {
    if (!settings?.autoTranslate) return;

    const root = findMessagesRoot();
    const scrollContainer = findScrollContainer(root);
    if (!isNearBottom(scrollContainer, 160)) return;

    const spans = (root || document).querySelectorAll('span[data-testid="selectable-text"]');
    spans.forEach((span) => {
      if (root && !root.contains(span)) return;

      const row = findMessageRowFromTextSpan(span);
      if (!row) return;
      if (!isElementVisible(row)) return;
      if (row.dataset.extTranslated || row.dataset.extTranslating) return;

      const text = (span.innerText || span.textContent || '').trim();
      if (!text || text.length < (settings?.minMessageLength || 3)) return;

      if (isOutgoingMessage(row)) return;

      const chatId = getCurrentChatId();
      const messageId = row.getAttribute('data-id') || '';
      const msgKey = generateMessageKey(chatId, 'incoming', text, messageId);

      if (translatedMessages.has(msgKey)) {
        const cached = translatedMessages.get(msgKey);
        displayTranslation(row, span, cached, 'incoming');
        row.dataset.extTranslated = '1';
        return;
      }

      row.dataset.extKey = msgKey;
      row.dataset.extTranslating = '1';
      translateMessage(row, text, 'incoming', span);
    });
  }

  function startIncomingTranslation() {
    // Scan on interval (more resilient to DOM changes)
    setInterval(scanVisibleMessages, 1200);

    // Also scan shortly after load
    setTimeout(scanVisibleMessages, 1200);
  }

  // Translate a message
  async function translateMessage(element, text, direction, textSpan) {
    const source = direction === 'incoming' 
      ? (settings?.sourceLanguage || 'auto')
      : (settings?.sendSourceLanguage || 'auto');
    const target = direction === 'incoming'
      ? (settings?.targetLanguage || 'EN')
      : (settings?.sendTargetLanguage || 'EN');

    try {
      const result = await sendMessage({
        type: 'TRANSLATE',
        data: { text, source, target, direction }
      });

      if (result.success) {
        // Skip if same language detected and setting enabled
        if (settings?.skipSameLanguage && 
            result.detectedSourceLang?.toUpperCase() === target.toUpperCase()) {
          element.dataset.extTranslated = '1';
          return;
        }

        const msgKey = element.dataset.extKey;
        if (msgKey) {
          addToCache(msgKey, result.translatedText);
        }

        displayTranslation(element, textSpan, result.translatedText, direction);
        element.dataset.extTranslated = '1';
        delete element.dataset.extTranslating;
      } else {
        console.error('Translation error:', result.error);
        if (result.error?.code === 'LIMIT_EXCEEDED') {
          displayError(element, textSpan, 'Translation limit exceeded');
        }
        delete element.dataset.extTranslating;
      }
    } catch (error) {
      console.error('Translation failed:', error);
      delete element.dataset.extTranslating;
    }
  }

  // Display translation for a message
  function displayTranslation(messageElement, textSpan, translation, direction) {
    const textContainer = textSpan
      ? findMessageTextContainerFromSpan(textSpan)
      : findMessageTextContainerFromSpan(messageElement.querySelector('span[data-testid="selectable-text"]'));
    if (!textContainer) return;

    // Remove existing translation if any
    const existing = messageElement.querySelector('.wt-translation');
    if (existing) existing.remove();

    const scrollContainer = findScrollContainer(messageElement);
    const wasAtBottom = isNearBottom(scrollContainer, 160);

    const anchor = textContainer.parentElement || textContainer;

    if (direction === 'incoming') {
      // Incoming: translation ABOVE original
      const transEl = document.createElement('div');
      transEl.className = `wt-translation style-${settings?.translationStyle || 'normal'} ${direction}`;
      transEl.textContent = translation;
      anchor.insertBefore(transEl, textContainer);

      // Dim the original text
      textContainer.classList.add('wt-original-dimmed');
    } else {
      // Outgoing: original text shown BELOW the sent translation
      const origEl = document.createElement('div');
      origEl.className = `wt-translation style-${settings?.translationStyle || 'normal'} ${direction}`;
      origEl.textContent = translation; // "translation" here is actually the original text
      anchor.appendChild(origEl);
    }

    if (wasAtBottom) {
      scrollToBottom(scrollContainer);
    }
  }

  // Display error
  function displayError(messageElement, textSpan, error) {
    const textContainer = textSpan
      ? findMessageTextContainerFromSpan(textSpan)
      : messageElement.querySelector('[data-testid="msg-text"]');
    if (!textContainer) return;

    const errorEl = document.createElement('div');
    errorEl.className = 'wt-error';
    errorEl.textContent = error;
    const anchor = textContainer.parentElement || textContainer;
    anchor.appendChild(errorEl);
  }

  // ===== Floating Widget (FAB) =====

  let fabContainer = null;
  let fabBtn = null;
  let fabClose = null;
  let fabMenu = null;
  let fabAutoToggle = null;
  let fabSendToggle = null;
  let fabLangIn = null;
  let fabLangOut = null;

  function createFloatingWidget() {
    if (document.querySelector('.wt-fab-container')) return;

    // Container wraps FAB + close button
    fabContainer = document.createElement('div');
    fabContainer.className = 'wt-fab-container';

    // FAB button
    fabBtn = document.createElement('button');
    fabBtn.className = 'wt-fab';
    fabBtn.title = 'WhatsApp Translator';
    fabBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

    // Close button (small X circle)
    fabClose = document.createElement('button');
    fabClose.className = 'wt-fab-close';
    fabClose.title = wt('hideWidget');
    fabClose.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 105.7 7.11L10.59 12 5.7 16.89a1 1 0 101.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z"/></svg>';

    fabContainer.appendChild(fabBtn);
    fabContainer.appendChild(fabClose);

    // FAB menu
    fabMenu = document.createElement('div');
    fabMenu.className = 'wt-fab-menu';
    fabMenu.innerHTML = `
      <div class="wt-fab-menu-header" data-wt="header">${wt('header')}</div>
      <div class="wt-fab-toggle" data-key="autoTranslate">
        <span data-wt="autoTranslate">${wt('autoTranslate')}</span>
        <div class="wt-switch"><input type="checkbox"><span class="wt-slider"></span></div>
      </div>
      <div class="wt-fab-divider"></div>
      <div class="wt-fab-toggle" data-key="sendTranslation">
        <span data-wt="sendTranslation">${wt('sendTranslation')}</span>
        <div class="wt-switch"><input type="checkbox"><span class="wt-slider"></span></div>
      </div>
      <div class="wt-fab-langs">
        <div class="wt-fab-lang-row"><span class="wt-fab-lang-label" data-wt="incoming">${wt('incoming')}</span> <span class="wt-fab-lang-value" id="wt-lang-in"></span></div>
        <div class="wt-fab-lang-row"><span class="wt-fab-lang-label" data-wt="outgoing">${wt('outgoing')}</span> <span class="wt-fab-lang-value" id="wt-lang-out"></span></div>
      </div>
    `;

    document.body.appendChild(fabContainer);
    document.body.appendChild(fabMenu);

    fabAutoToggle = fabMenu.querySelector('[data-key="autoTranslate"] input');
    fabSendToggle = fabMenu.querySelector('[data-key="sendTranslation"] input');
    fabLangIn = fabMenu.querySelector('#wt-lang-in');
    fabLangOut = fabMenu.querySelector('#wt-lang-out');

    // Set initial state
    updateFloatingWidget();

    // Toggle menu on FAB click
    fabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fabMenu.classList.toggle('open');
    });

    // Close button — hide widget and save setting
    fabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.showFloatingWidget = false;
      sendMessage({ type: 'SAVE_SETTINGS', data: settings });
      updateWidgetVisibility();
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!fabMenu.contains(e.target) && !fabContainer.contains(e.target)) {
        fabMenu.classList.remove('open');
      }
    });

    // Toggle row click — single click anywhere on the row toggles
    fabMenu.querySelectorAll('.wt-fab-toggle').forEach((row) => {
      const checkbox = row.querySelector('input');
      const key = row.dataset.key;

      row.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        settings[key] = checkbox.checked;
        sendMessage({ type: 'SAVE_SETTINGS', data: settings });
        updateFabColor();
      });
    });
  }

  function updateFloatingWidget() {
    if (!fabAutoToggle || !settings) return;
    fabAutoToggle.checked = !!settings.autoTranslate;
    fabSendToggle.checked = !!settings.sendTranslation;

    const inSrc = settings.sourceLanguage || 'auto';
    const inTgt = settings.targetLanguage || 'EN';
    const outSrc = settings.sendSourceLanguage || 'auto';
    const outTgt = settings.sendTargetLanguage || 'EN';
    fabLangIn.textContent = `${inSrc} → ${inTgt}`;
    fabLangOut.textContent = `${outSrc} → ${outTgt}`;

    updateFabColor();
    updateWidgetVisibility();
  }

  function updateFabColor() {
    if (!fabBtn || !settings) return;
    const active = settings.autoTranslate || settings.sendTranslation;
    fabBtn.classList.toggle('inactive', !active);
  }

  function updateWidgetVisibility() {
    if (!fabContainer) return;
    const visible = settings?.showFloatingWidget !== false;
    fabContainer.style.display = visible ? '' : 'none';
    fabMenu.style.display = visible ? '' : 'none';
    if (!visible) fabMenu.classList.remove('open');
  }

  function applyWidgetLanguage() {
    if (!fabMenu) return;
    fabMenu.querySelectorAll('[data-wt]').forEach((el) => {
      el.textContent = wt(el.getAttribute('data-wt'));
    });
    if (fabClose) fabClose.title = wt('hideWidget');
  }

  // Inject translate button for outgoing messages
  function injectTranslateButton() {
    const checkInterval = setInterval(() => {
      const inputFooter = document.querySelector('[data-testid="conversation-compose-box-input"]');
      if (inputFooter && !document.querySelector('.wt-translate-btn')) {
        clearInterval(checkInterval);
        createTranslateButton(inputFooter);
      }
    }, 1000);
  }

  function createTranslateButton(inputElement) {
    // Find send button container
    const sendBtnContainer = document.querySelector('[data-testid="send"]')?.parentElement;
    if (!sendBtnContainer) return;

    const btn = document.createElement('button');
    btn.className = 'wt-translate-btn';
    btn.title = 'Translate & Send';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;
    
    btn.addEventListener('click', async () => {
      if (!settings?.sendTranslation) {
        alert('Send Translation is disabled. Enable it in the extension settings.');
        return;
      }

      const inputDiv = document.querySelector('[data-testid="conversation-compose-box-input"] [contenteditable="true"]');
      if (!inputDiv) return;

      const text = inputDiv.textContent?.trim();
      if (!text || text.length < 2) return;

      btn.classList.add('loading');

      try {
        await translateAndSend(text);
      } finally {
        btn.classList.remove('loading');
      }
    });

    sendBtnContainer.parentElement.insertBefore(btn, sendBtnContainer);
  }

  function getInputBox() {
    return document.querySelector('footer div[contenteditable="true"][data-lexical-editor="true"]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]') ||
      document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
      document.querySelector('[data-testid="conversation-compose-box-input"] [contenteditable="true"]');
  }

  function getInputText() {
    const input = getInputBox();
    return input ? (input.innerText || input.textContent || '') : '';
  }

  function pasteTextIntoInput(input, text) {
    if (!input) return;

    input.focus();

    try {
      document.execCommand('selectAll', false);
    } catch {}

    try {
      const paste = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      paste.clipboardData.setData('text/plain', text);
      input.dispatchEvent(paste);
    } catch {
      input.textContent = text;
    }

    try {
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    } catch {}
  }

  function getSendButtons() {
    const selectors = [
      '[data-icon="wds-ic-send-filled"]',
      '[data-icon^="wds-ic-send"]',
      '[data-icon*="send"]',
      'button[aria-label="Send"]',
      'button[aria-label="发送"]',
      'button[title="Send"]',
      'button[title="发送"]',
      'button[data-testid="compose-btn-send"]',
      'div[data-testid="send-button"]',
      '[data-testid="send"]'
    ];

    const found = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => found.push(el));
    });

    return found;
  }

  function triggerSendClick() {
    const btns = getSendButtons();
    const btn = btns.length ? btns[0] : null;
    if (btn) btn.click();
  }

  function showTranslatingOverlay() {
    removeTranslatingOverlay();
    const input = getInputBox();
    if (!input) return;
    // Find the compose box container (the one with position:relative or the input's parent)
    const container = input.closest('[data-testid="conversation-compose-box-input"]') || input.parentElement;
    if (!container) return;
    // Ensure container is positioned for absolute overlay
    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'wt-translating-overlay';
    overlay.innerHTML = `
      <div class="wt-translating-dots"><span></span><span></span><span></span></div>
      <span class="wt-translating-label">${wt('translating')}</span>
    `;
    container.appendChild(overlay);
  }

  function removeTranslatingOverlay() {
    document.querySelectorAll('.wt-translating-overlay').forEach(el => el.remove());
  }

  async function translateAndSend(originalText) {
    if (!settings?.sendTranslation) {
      return;
    }

    if (!originalText || originalText.trim().length < 2) return;

    if (isSending) return;
    isSending = true;
    showTranslatingOverlay();

    try {
      const result = await sendMessage({
        type: 'TRANSLATE',
        data: {
          text: originalText,
          source: settings.sendSourceLanguage || 'auto',
          target: settings.sendTargetLanguage || 'EN',
          direction: 'outgoing'
        }
      });

      removeTranslatingOverlay();

      if (result.success) {
        if (settings?.skipSameLanguage &&
            result.detectedSourceLang?.toUpperCase() === (settings.sendTargetLanguage || 'EN').toUpperCase()) {
          bypassNextSend = true;
          triggerSendClick();
          return;
        }

        // Save original for display after send
        lastSentTranslation = {
          original: originalText,
          translated: result.translatedText,
          timestamp: Date.now(),
        };

        const input = getInputBox();
        pasteTextIntoInput(input, result.translatedText);

        bypassNextSend = true;
        setTimeout(() => {
          triggerSendClick();
          // After send, find the sent message and annotate it
          setTimeout(markLastSentMessage, 400);
        }, 80);
      } else {
        alert('Translation failed: ' + (result.error?.message || 'Unknown error'));
      }
    } catch (error) {
      removeTranslatingOverlay();
      console.error('Translation error:', error);
      alert('Translation failed');
    } finally {
      isSending = false;
    }
  }

  function markLastSentMessage() {
    if (!lastSentTranslation) return;
    // Only valid for 5 seconds after send
    if (Date.now() - lastSentTranslation.timestamp > 5000) {
      lastSentTranslation = null;
      return;
    }

    const root = findMessagesRoot();
    if (!root) return;

    // Find the last outgoing message containing the translated text
    const spans = root.querySelectorAll('span[data-testid="selectable-text"]');
    let targetRow = null;
    let targetSpan = null;

    // Search from the end (most recent messages)
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      const row = findMessageRowFromTextSpan(span);
      if (!row || !isOutgoingMessage(row)) continue;
      const text = (span.innerText || span.textContent || '').trim();
      if (text === lastSentTranslation.translated) {
        targetRow = row;
        targetSpan = span;
        break;
      }
    }

    if (targetRow && targetSpan) {
      // Mark so auto-translate skips this
      targetRow.dataset.extTranslated = '1';
      targetRow.dataset.extSentByUs = '1';

      // Show original text below the translated (sent) message
      displayTranslation(targetRow, targetSpan, lastSentTranslation.original, 'outgoing');
    }

    lastSentTranslation = null;
  }

  function hookSendButtons() {
    if (!settings?.sendTranslation) return;

    const btns = getSendButtons();
    btns.forEach((btn) => {
      const target = btn.closest('div[role="button"]') || btn.closest('button') || btn;
      if (!target || target.classList.contains('wt-send-hooked')) return;

      target.classList.add('wt-send-hooked');

      const handler = async (event) => {
        if (!settings?.sendTranslation) return;
        if (isSending) return;
        if (bypassNextSend) {
          bypassNextSend = false;
          return;
        }

        const text = getInputText().trim();
        if (!text) return;

        event.stopPropagation();
        event.preventDefault();

        await translateAndSend(text);
      };

      target.addEventListener('click', handler, true);
    });
  }

  function hookEnterToSend() {
    const input = getInputBox();
    if (!input || input.classList.contains('wt-enter-hooked')) return;

    input.classList.add('wt-enter-hooked');
    input.addEventListener('keydown', async (event) => {
      if (!settings?.sendTranslation) return;
      if (isSending) return;

      if (event.key === 'Enter' && event.ctrlKey) {
        const text = getInputText().trim();
        if (!text) return;
        event.stopPropagation();
        event.preventDefault();
        bypassNextSend = true;
        triggerSendClick();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        const text = getInputText().trim();
        if (!text) return;
        event.stopPropagation();
        event.preventDefault();
        await translateAndSend(text);
      }
    }, true);
  }

  function startSendHooks() {
    if (sendHookInterval) clearInterval(sendHookInterval);
    sendHookInterval = setInterval(() => {
      hookSendButtons();
      hookEnterToSend();
    }, 800);
  }

  // Re-initialize on navigation
  const navigationObserver = new MutationObserver(() => {
    if (!document.querySelector('.wt-translate-btn')) {
      injectTranslateButton();
    }
  });

  setTimeout(() => {
    const app = document.getElementById('app');
    if (app) {
      navigationObserver.observe(app, { childList: true, subtree: true });
    }
  }, 3000);

})();
