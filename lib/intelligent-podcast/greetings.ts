/**
 * Pre-recorded greeting audio for instant Q&A transitions.
 *
 * Greetings are stored in Supabase Storage (generated via POST /api/intelligent-podcast/greetings).
 * On page load, we fetch the greeting URLs from the API and preload the audio elements.
 * Falls back to static files in public/audio/greetings/ if API fails.
 */

const GREETING_COUNT = 5

// Static fallback paths (used if API fetch fails or files exist locally)
const STATIC_FR = Array.from({ length: GREETING_COUNT }, (_, i) => `/audio/greetings/fr_${i + 1}.wav`)
const STATIC_EN = Array.from({ length: GREETING_COUNT }, (_, i) => `/audio/greetings/en_${i + 1}.wav`)

// Cached URLs from API (populated on first fetch)
let cachedUrls: Record<string, string[]> | null = null

/**
 * Fetch greeting URLs from the API (Supabase Storage).
 * Falls back to static paths if the API is unavailable.
 */
export async function fetchGreetingUrls(): Promise<Record<string, string[]>> {
  if (cachedUrls) return cachedUrls

  try {
    const res = await fetch('/api/intelligent-podcast/greetings')
    if (res.ok) {
      const data = await res.json()
      if (data.urls?.fr?.length && data.urls?.en?.length) {
        cachedUrls = data.urls
        return cachedUrls!
      }
    }
  } catch {}

  // Fallback to static files
  cachedUrls = { fr: STATIC_FR, en: STATIC_EN }
  return cachedUrls
}

export function getGreetings(language: string): string[] {
  if (cachedUrls) {
    return language === 'fr' ? cachedUrls.fr : cachedUrls.en
  }
  return language === 'fr' ? STATIC_FR : STATIC_EN
}
