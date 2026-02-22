// Background Service Worker
const API_URL = 'http://192.168.5.70:3000'; // Change to your server URL

// Token management
async function getTokens() {
  const result = await chrome.storage.local.get(['accessToken', 'refreshToken']);
  return result;
}

async function setTokens(accessToken, refreshToken) {
  await chrome.storage.local.set({ accessToken, refreshToken });
}

async function clearTokens() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
}

async function refreshAccessToken() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      await setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } else {
      await clearTokens();
      return null;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

// API calls with auto-refresh
async function apiCall(path, options = {}) {
  let { accessToken } = await getTokens();

  const makeRequest = async (token) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  };

  let response = await makeRequest(accessToken);

  // If unauthorized, try to refresh token
  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    if (accessToken) {
      response = await makeRequest(accessToken);
    }
  }

  return response;
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'LOGIN':
      return handleLogin(message.data);

    case 'LOGOUT':
      return handleLogout();

    case 'GET_AUTH_STATUS':
      return getAuthStatus();

    case 'TRANSLATE':
      return handleTranslate(message.data);

    case 'GET_SETTINGS':
      return getSettings();

    case 'SAVE_SETTINGS':
      return saveSettings(message.data);

    case 'GET_USAGE':
      return getUsage();

    case 'GET_LANGUAGES':
      return getLanguages();

    case 'UI_LANGUAGE_CHANGED':
      return handleUiLanguageChanged(message.lang);

    case 'TRANSLATE_BATCH':
      return handleTranslateBatch(message.data);

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleLogin({ email, password }) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      await setTokens(data.accessToken, data.refreshToken);
      await chrome.storage.local.set({ user: data.user });
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error?.message || 'Login failed' };
    }
  } catch (error) {
    return { success: false, error: 'Connection failed' };
  }
}

async function handleLogout() {
  try {
    const { refreshToken } = await getTokens();
    if (refreshToken) {
      await apiCall('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch (e) {}
  
  await clearTokens();
  return { success: true };
}

async function getAuthStatus() {
  const { accessToken, user } = await chrome.storage.local.get(['accessToken', 'user']);
  
  if (!accessToken) {
    return { authenticated: false };
  }

  // Verify token
  const response = await apiCall('/auth/me');
  
  if (response.ok) {
    const userData = await response.json();
    await chrome.storage.local.set({ user: userData });
    return { authenticated: true, user: userData };
  } else {
    await clearTokens();
    return { authenticated: false };
  }
}

async function handleTranslate({ text, source, target, direction }) {
  const response = await apiCall('/translate', {
    method: 'POST',
    body: JSON.stringify({
      text,
      source: source || 'auto',
      target,
      context: { direction },
    }),
  });

  const data = await response.json();

  if (response.ok) {
    return { success: true, ...data };
  } else {
    return { success: false, error: data.error };
  }
}

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || {
    autoTranslate: false,
    sourceLanguage: 'auto',
    targetLanguage: 'EN',
    sendTranslation: false,
    sendSourceLanguage: 'auto',
    sendTargetLanguage: 'EN',
    translationStyle: 'normal',
    skipSameLanguage: true,
    minMessageLength: 3,
    showFloatingWidget: true,
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // Notify content scripts
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
  }
  return { success: true };
}

async function handleUiLanguageChanged(lang) {
  await chrome.storage.local.set({ uiLanguage: lang });
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'UI_LANGUAGE_CHANGED', lang });
  }
  return { success: true };
}

async function getUsage() {
  const response = await apiCall('/usage');
  if (response.ok) {
    return await response.json();
  }
  return null;
}

async function handleTranslateBatch({ segments, source, target }) {
  try {
    const response = await apiCall('/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ segments, source: source || 'auto', target }),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: 'Batch translation failed' };
  }
}

async function getLanguages() {
  try {
    const response = await fetch(`${API_URL}/languages`);
    if (response.ok) {
      const data = await response.json();
      return data.languages;
    }
  } catch (e) {}
  
  // Fallback
  return [
    { code: 'EN', name: 'English' },
    { code: 'RU', name: 'Russian' },
    { code: 'ES', name: 'Spanish' },
    { code: 'DE', name: 'German' },
    { code: 'FR', name: 'French' },
    { code: 'IT', name: 'Italian' },
    { code: 'PT', name: 'Portuguese' },
    { code: 'ZH', name: 'Chinese' },
    { code: 'JA', name: 'Japanese' },
    { code: 'KO', name: 'Korean' },
  ];
}
