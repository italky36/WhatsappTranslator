import { prisma } from '../utils/prisma.js';
import { decrypt } from '../utils/crypto.js';

interface DeepLConfig {
  apiKey: string;
  endpoint: string;
}

interface TranslateResult {
  translatedText: string;
  detectedSourceLang: string;
  charCount: number;
}

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

interface DeepLUsage {
  character_count: number;
  character_limit: number;
}

export async function getDeepLConfig(): Promise<DeepLConfig | null> {
  const keyRecord = await prisma.appSetting.findUnique({
    where: { key: 'deepl_api_key' }
  });
  
  const endpointRecord = await prisma.appSetting.findUnique({
    where: { key: 'deepl_endpoint' }
  });
  
  if (!keyRecord) {
    return null;
  }
  
  try {
    const apiKey = decrypt(keyRecord.valueEncrypted);
    const endpoint = endpointRecord 
      ? decrypt(endpointRecord.valueEncrypted) 
      : 'https://api-free.deepl.com';
    
    return { apiKey, endpoint };
  } catch {
    return null;
  }
}

export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslateResult> {
  const config = await getDeepLConfig();
  
  if (!config) {
    throw new Error('PROVIDER_NOT_CONFIGURED');
  }
  
  const url = `${config.endpoint}/v2/translate`;
  
  const body: Record<string, string | string[]> = {
    text: [text],
    target_lang: targetLang.toUpperCase(),
  };
  
  if (sourceLang && sourceLang.toLowerCase() !== 'auto') {
    body.source_lang = sourceLang.toUpperCase();
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('DeepL API error:', response.status, errorText);
    
    if (response.status === 403) {
      throw new Error('INVALID_API_KEY');
    }
    if (response.status === 456) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error('TRANSLATION_FAILED');
  }
  
  const data = await response.json() as DeepLResponse;
  const translation = data.translations[0];
  
  return {
    translatedText: translation.text,
    detectedSourceLang: translation.detected_source_language,
    charCount: text.length,
  };
}

interface TranslateBatchResult {
  translations: Array<{ translatedText: string; detectedSourceLang: string }>;
  totalCharCount: number;
}

const DEEPL_BATCH_LIMIT = 50;

export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang?: string
): Promise<TranslateBatchResult> {
  const config = await getDeepLConfig();

  if (!config) {
    throw new Error('PROVIDER_NOT_CONFIGURED');
  }

  const url = `${config.endpoint}/v2/translate`;

  // Filter out empty strings, keeping track of their positions
  const indexedTexts = texts.map((text, i) => ({ text, originalIndex: i }));
  const nonEmpty = indexedTexts.filter(t => t.text.length > 0);
  const emptyIndices = new Set(indexedTexts.filter(t => t.text.length === 0).map(t => t.originalIndex));

  if (nonEmpty.length === 0) {
    return {
      translations: texts.map(() => ({ translatedText: '', detectedSourceLang: '' })),
      totalCharCount: 0,
    };
  }

  // Split into chunks of DEEPL_BATCH_LIMIT
  const chunks: Array<typeof nonEmpty> = [];
  for (let i = 0; i < nonEmpty.length; i += DEEPL_BATCH_LIMIT) {
    chunks.push(nonEmpty.slice(i, i + DEEPL_BATCH_LIMIT));
  }

  const allTranslations: Array<{ translatedText: string; detectedSourceLang: string; originalIndex: number }> = [];
  let totalCharCount = 0;

  for (const chunk of chunks) {
    const body: Record<string, string | string[]> = {
      text: chunk.map(t => t.text),
      target_lang: targetLang.toUpperCase(),
    };

    if (sourceLang && sourceLang.toLowerCase() !== 'auto') {
      body.source_lang = sourceLang.toUpperCase();
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepL API error:', response.status, errorText);

      if (response.status === 403) {
        throw new Error('INVALID_API_KEY');
      }
      if (response.status === 456) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error('TRANSLATION_FAILED');
    }

    const data = await response.json() as DeepLResponse;

    for (let i = 0; i < data.translations.length; i++) {
      const t = data.translations[i];
      allTranslations.push({
        translatedText: t.text,
        detectedSourceLang: t.detected_source_language,
        originalIndex: chunk[i].originalIndex,
      });
      totalCharCount += chunk[i].text.length;
    }
  }

  // Rebuild result array in original order
  const result: Array<{ translatedText: string; detectedSourceLang: string }> = new Array(texts.length);

  for (const t of allTranslations) {
    result[t.originalIndex] = {
      translatedText: t.translatedText,
      detectedSourceLang: t.detectedSourceLang,
    };
  }

  // Fill empty positions
  for (const idx of emptyIndices) {
    result[idx] = { translatedText: '', detectedSourceLang: '' };
  }

  return { translations: result, totalCharCount };
}

export async function testApiKey(apiKey: string, endpoint: string): Promise<{ valid: boolean; usage?: DeepLUsage; error?: string }> {
  try {
    const response = await fetch(`${endpoint}/v2/usage`, {
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    const usage = await response.json() as DeepLUsage;
    return { valid: true, usage };
  } catch (error) {
    return { valid: false, error: 'Connection failed' };
  }
}

export const SUPPORTED_LANGUAGES = [
  { code: 'AR', name: 'Arabic' },
  { code: 'BG', name: 'Bulgarian' },
  { code: 'CS', name: 'Czech' },
  { code: 'DA', name: 'Danish' },
  { code: 'DE', name: 'German' },
  { code: 'EL', name: 'Greek' },
  { code: 'EN', name: 'English' },
  { code: 'EN-GB', name: 'English (UK)' },
  { code: 'EN-US', name: 'English (US)' },
  { code: 'ES', name: 'Spanish' },
  { code: 'ET', name: 'Estonian' },
  { code: 'FI', name: 'Finnish' },
  { code: 'FR', name: 'French' },
  { code: 'HU', name: 'Hungarian' },
  { code: 'ID', name: 'Indonesian' },
  { code: 'IT', name: 'Italian' },
  { code: 'JA', name: 'Japanese' },
  { code: 'KO', name: 'Korean' },
  { code: 'LT', name: 'Lithuanian' },
  { code: 'LV', name: 'Latvian' },
  { code: 'NB', name: 'Norwegian' },
  { code: 'NL', name: 'Dutch' },
  { code: 'PL', name: 'Polish' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'PT-BR', name: 'Portuguese (BR)' },
  { code: 'PT-PT', name: 'Portuguese (EU)' },
  { code: 'RO', name: 'Romanian' },
  { code: 'RU', name: 'Russian' },
  { code: 'SK', name: 'Slovak' },
  { code: 'SL', name: 'Slovenian' },
  { code: 'SV', name: 'Swedish' },
  { code: 'TR', name: 'Turkish' },
  { code: 'UK', name: 'Ukrainian' },
  { code: 'ZH', name: 'Chinese' },
];
