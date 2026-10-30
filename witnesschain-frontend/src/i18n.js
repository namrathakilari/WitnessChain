// src/i18n.js — MyMemory API (free, no billing, no API key)
const cache = {}

export const LANGUAGES = [
  { code: 'en', label: 'English',    region: 'india' },
  { code: 'hi', label: 'हिंदी',       region: 'india' },
  { code: 'te', label: 'తెలుగు',      region: 'india' },
  { code: 'ta', label: 'தமிழ்',       region: 'india' },
  { code: 'kn', label: 'ಕನ್ನಡ',       region: 'india' },
  { code: 'ml', label: 'മലയാളം',      region: 'india' },
  { code: 'mr', label: 'मराठी',       region: 'india' },
  { code: 'gu', label: 'ગુજરાતી',     region: 'india' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ',      region: 'india' },
  { code: 'bn', label: 'বাংলা',       region: 'india' },
  { code: 'ur', label: 'اردو',        region: 'india' },
  { code: 'es', label: 'Español',     region: 'international' },
  { code: 'fr', label: 'Français',    region: 'international' },
  { code: 'de', label: 'Deutsch',     region: 'international' },
  { code: 'ar', label: 'العربية',     region: 'international' },
  { code: 'zh', label: '中文',         region: 'international' },
  { code: 'ja', label: '日本語',       region: 'international' },
  { code: 'pt', label: 'Português',   region: 'international' },
  { code: 'ru', label: 'Русский',     region: 'international' },
]

async function translateOne(text, targetLang) {
  const cacheKey = `${targetLang}::${text}`
  if (cache[cacheKey]) return cache[cacheKey]

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`
    const res = await fetch(url)
    const data = await res.json()
    const result = data?.responseData?.translatedText || text
    cache[cacheKey] = result
    return result
  } catch {
    return text
  }
}

export async function translateBatch(texts, targetLang) {
  if (targetLang === 'en') return Object.fromEntries(texts.map(t => [t, t]))

  // MyMemory doesn't support batch — run in parallel with small delay to avoid rate limit
  const results = await Promise.all(
    texts.map((text, i) =>
      new Promise(resolve =>
        setTimeout(async () => {
          const translated = await translateOne(text, targetLang)
          resolve([text, translated])
        }, i * 50) // 50ms stagger between requests
      )
    )
  )

  return Object.fromEntries(results)
}

export function detectLanguage() {
  const browserLang = navigator.language?.split('-')[0] || 'en'
  return LANGUAGES.find(l => l.code === browserLang) ? browserLang : 'en'
}