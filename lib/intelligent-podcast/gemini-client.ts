/**
 * Google Gemini LLM client via REST (generativelanguage.googleapis.com).
 * Uses a single API key: GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_CLOUD_API_KEY.
 * No Replicate, no OpenAI — works with Google free credits.
 */

type GeminiThinkingLevel = 'low' | 'high'

export interface GeminiRunParams {
  prompt: string
  systemInstruction?: string
  images?: string[] // data URLs (data:image/...;base64,...) or raw base64
  thinkingLevel?: GeminiThinkingLevel
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash'

function getApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY
  if (!key) {
    throw new Error(
      'Set one of GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_CLOUD_API_KEY (Google AI / Cloud) for the podcast creator.'
    )
  }
  return key
}

/**
 * Parse data URL or base64 string into { mimeType, data } for Gemini inline_data.
 */
function parseImageForApi(image: string): { mimeType: string; data: string } {
  const s = image.trim()
  const dataUrlMatch = s.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1].trim() || 'image/png', data: dataUrlMatch[2] }
  }
  // Assume raw base64
  return { mimeType: 'image/png', data: s }
}

/**
 * Build contents[].parts: text first, then each image as inline_data.
 */
function buildParts(prompt: string, images?: string[]): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []
  if (prompt) parts.push({ text: prompt })
  if (images?.length) {
    for (const img of images) {
      const { mimeType, data } = parseImageForApi(img)
      parts.push({ inline_data: { mime_type: mimeType, data } })
    }
  }
  return parts
}

/**
 * Call Google Gemini generateContent (text + optional images). One request, no polling.
 */
export async function runGemini3Flash(params: GeminiRunParams): Promise<string> {
  const apiKey = getApiKey()
  const url = `${GEMINI_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const parts = buildParts(params.prompt, params.images)
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: params.temperature ?? 0.6,
      topP: params.topP ?? 0.95,
      maxOutputTokens: params.maxOutputTokens ?? 8192,
      // Optional: disable thinking to reduce latency/cost if needed
      ...(params.thinkingLevel === 'low' && { thinkingConfig: { thinkingBudget: 0 } }),
    },
  }
  if (params.systemInstruction) {
    body.system_instruction = { parts: [{ text: params.systemInstruction }] }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      finishReason?: string
    }>
    promptFeedback?: { blockReason?: string }
  }

  const candidate = data.candidates?.[0]
  if (!candidate?.content?.parts?.length) {
    const blockReason = data.promptFeedback?.blockReason
    throw new Error(blockReason ? `Gemini blocked: ${blockReason}` : 'Gemini returned no text')
  }

  const textParts = candidate.content.parts.map((p) => p.text ?? '').filter(Boolean)
  return textParts.join('')
}

export function parseJsonObject<T = unknown>(raw: string): T {
  const text = raw.trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model output did not contain a JSON object')
  }
  const jsonText = text.slice(first, last + 1)
  return JSON.parse(jsonText) as T
}
