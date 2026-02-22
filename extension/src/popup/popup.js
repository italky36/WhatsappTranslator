// Popup script

// ===== i18n =====
const i18n = {
  en: {
    headerSubtitle: 'Corporate Translation Tool',
    loading: 'Loading...',
    email: 'Email',
    password: 'Password',
    loginBtn: 'Login',
    logout: 'Logout',
    usageTitle: 'Usage This Month',
    incomingTitle: 'Incoming Messages',
    autoTranslate: 'Auto Translate',
    fromLang: 'From Language',
    toLang: 'To Language',
    autoDetect: 'Auto Detect',
    transStyle: 'Translation Style',
    styleSmall: 'Small (subtle)',
    styleNormal: 'Normal',
    styleCompact: 'Compact',
    outgoingTitle: 'Outgoing Messages',
    sendTranslation: 'Enable Send Translation',
    widgetTitle: 'Widget',
    showWidget: 'Show floating widget',
    optionsTitle: 'Options',
    skipSame: 'Skip if same language',
    minLength: 'Min message length (chars)',
    docTranslate: 'Document Translation',
    saveBtn: 'Save Settings',
    saved: 'Saved!',
    usageUnlimited: '{used} chars used (Unlimited)',
    usageLimit: '{used} / {limit} chars',
  },
  ru: {
    headerSubtitle: 'Корпоративный переводчик',
    loading: 'Загрузка...',
    email: 'Электронная почта',
    password: 'Пароль',
    loginBtn: 'Войти',
    logout: 'Выйти',
    usageTitle: 'Использование за месяц',
    incomingTitle: 'Входящие сообщения',
    autoTranslate: 'Автоперевод',
    fromLang: 'Язык оригинала',
    toLang: 'Язык перевода',
    autoDetect: 'Автоопределение',
    transStyle: 'Стиль перевода',
    styleSmall: 'Мелкий (незаметный)',
    styleNormal: 'Обычный',
    styleCompact: 'Компактный',
    outgoingTitle: 'Исходящие сообщения',
    sendTranslation: 'Переводить при отправке',
    widgetTitle: 'Виджет',
    showWidget: 'Показывать плавающий виджет',
    optionsTitle: 'Настройки',
    skipSame: 'Пропускать одинаковый язык',
    minLength: 'Мин. длина сообщения (символов)',
    docTranslate: 'Перевод документов',
    saveBtn: 'Сохранить настройки',
    saved: 'Сохранено!',
    usageUnlimited: '{used} символов использовано (Безлимит)',
    usageLimit: '{used} / {limit} символов',
  },
};

let currentLang = 'en';

function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;

  // Update all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // Update language switcher buttons
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

// ===== Main logic =====

document.addEventListener('DOMContentLoaded', init);

async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function init() {
  // Load saved UI language first
  const { uiLanguage } = await chrome.storage.local.get('uiLanguage');
  if (uiLanguage) {
    currentLang = uiLanguage;
  }
  applyLanguage(currentLang);

  const status = await sendMessage({ type: 'GET_AUTH_STATUS' });

  document.getElementById('loading').style.display = 'none';

  if (status.authenticated) {
    showMainScreen(status.user);
  } else {
    showLoginScreen();
  }

  // Language switcher clicks
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      applyLanguage(lang);
      chrome.storage.local.set({ uiLanguage: lang });
      // Notify content scripts about language change
      sendMessage({ type: 'UI_LANGUAGE_CHANGED', lang });
    });
  });
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('main-screen').classList.remove('active');
}

async function showMainScreen(user) {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');

  document.getElementById('user-email').textContent = user.email;

  // Load languages
  const languages = await sendMessage({ type: 'GET_LANGUAGES' });
  populateLanguageSelects(languages);

  // Load settings
  const settings = await sendMessage({ type: 'GET_SETTINGS' });
  applySettings(settings);

  // Load usage
  loadUsage();
}

function populateLanguageSelects(languages) {
  const selects = ['target-lang', 'send-target-lang'];
  const sourceSelects = ['source-lang', 'send-source-lang'];

  selects.forEach(id => {
    const select = document.getElementById(id);
    select.innerHTML = '';
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      select.appendChild(option);
    });
  });

  sourceSelects.forEach(id => {
    const select = document.getElementById(id);
    select.innerHTML = '';
    // Re-add auto detect option with i18n
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.setAttribute('data-i18n', 'autoDetect');
    autoOption.textContent = t('autoDetect');
    select.appendChild(autoOption);
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      select.appendChild(option);
    });
  });
}

function applySettings(settings) {
  document.getElementById('auto-translate').checked = settings.autoTranslate;
  document.getElementById('source-lang').value = settings.sourceLanguage;
  document.getElementById('target-lang').value = settings.targetLanguage;
  document.getElementById('trans-style').value = settings.translationStyle;
  document.getElementById('send-translation').checked = settings.sendTranslation;
  document.getElementById('send-source-lang').value = settings.sendSourceLanguage;
  document.getElementById('send-target-lang').value = settings.sendTargetLanguage;
  document.getElementById('skip-same').checked = settings.skipSameLanguage;
  document.getElementById('min-length').value = settings.minMessageLength;
  document.getElementById('show-widget').checked = settings.showFloatingWidget !== false;
}

async function loadUsage() {
  const usage = await sendMessage({ type: 'GET_USAGE' });

  if (usage) {
    const usageBar = document.getElementById('usage-bar');
    const usageText = document.getElementById('usage-text');

    if (usage.monthly.isUnlimited) {
      usageBar.style.width = '0%';
      usageText.textContent = t('usageUnlimited')
        .replace('{used}', usage.monthly.used.toLocaleString());
      usageText.removeAttribute('data-i18n');
    } else {
      const percent = Math.min((usage.monthly.used / usage.monthly.limit) * 100, 100);
      usageBar.style.width = `${percent}%`;
      usageText.textContent = t('usageLimit')
        .replace('{used}', usage.monthly.used.toLocaleString())
        .replace('{limit}', usage.monthly.limit.toLocaleString());
      usageText.removeAttribute('data-i18n');

      if (percent > 90) {
        usageBar.style.background = '#e53e3e';
      } else if (percent > 70) {
        usageBar.style.background = '#ed8936';
      }
    }
  }
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  const result = await sendMessage({
    type: 'LOGIN',
    data: { email, password }
  });

  if (result.success) {
    showMainScreen(result.user);
  } else {
    errorEl.textContent = result.error;
    errorEl.style.display = 'block';
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  showLoginScreen();
});

// Show-widget toggle — apply immediately
document.getElementById('show-widget').addEventListener('change', async (e) => {
  const current = await sendMessage({ type: 'GET_SETTINGS' });
  current.showFloatingWidget = e.target.checked;
  await sendMessage({ type: 'SAVE_SETTINGS', data: current });
});

// Open document translation page
document.getElementById('doc-translate-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/document/document.html') });
});

// Save settings
document.getElementById('save-btn').addEventListener('click', async () => {
  const settings = {
    autoTranslate: document.getElementById('auto-translate').checked,
    sourceLanguage: document.getElementById('source-lang').value,
    targetLanguage: document.getElementById('target-lang').value,
    translationStyle: document.getElementById('trans-style').value,
    sendTranslation: document.getElementById('send-translation').checked,
    sendSourceLanguage: document.getElementById('send-source-lang').value,
    sendTargetLanguage: document.getElementById('send-target-lang').value,
    skipSameLanguage: document.getElementById('skip-same').checked,
    minMessageLength: parseInt(document.getElementById('min-length').value) || 3,
    showFloatingWidget: document.getElementById('show-widget').checked,
  };

  await sendMessage({ type: 'SAVE_SETTINGS', data: settings });

  const btn = document.getElementById('save-btn');
  btn.textContent = t('saved');
  setTimeout(() => { btn.textContent = t('saveBtn'); }, 1500);
});
