/**
 * Google Gemini LLM client via REST (Google AI Studio only).
 * Vision + LLM use generativelanguage.googleapis.com with an API key from
 * https://aistudio.google.com/app/apikey (set GEMINI_API_KEY or GOOGLE_API_KEY).
 * Cloud Console keys (GOOGLE_CLOUD_API_KEY) are not supported for this API;
 * use them only for Google Cloud TTS.
 */

type GeminiThinkingLevel = 'low' | 'high'

export interface GeminiRunParams {
  prompt: string
  systemInstruction?: string
  /** data URLs (data:image/...;base64,...), raw base64, or http(s) image URLs (fetched and converted to base64) */
  images?: string[]
  thinkingLevel?: GeminiThinkingLevel
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash'

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) {
    throw new Error(
      'Set GEMINI_API_KEY or GOOGLE_API_KEY for the podcast creator (vision + LLM). Create a key at https://aistudio.google.com/app/apikey'
    )
  }
  return key
}

/**
 * If the string is an http(s) image URL, fetch it and return a data URL (base64).
 * Otherwise return the string as-is (already data URL or raw base64).
 */
async function resolveImageToBase64(image: string): Promise<string> {
  const s = image.trim()
  if (!s.startsWith('http://') && !s.startsWith('https://')) return s
  const res = await fetch(s, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buf = await res.arrayBuffer()
  const base64 = Buffer.from(buf).toString('base64')
  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  return `data:${contentType};base64,${base64}`
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
 * Build contents[].parts: text first, then each image (snake_case for AI Studio).
 */
function buildParts(
  prompt: string,
  images: string[] | undefined
): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
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
 * Image URLs (http/https) are fetched and converted to base64 before sending.
 */
export async function runGemini3Flash(params: GeminiRunParams): Promise<string> {
  const apiKey = getApiKey()
  const url = `${GEMINI_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const resolvedImages =
    params.images?.length ?
      await Promise.all(params.images.map((img) => resolveImageToBase64(img)))
      : undefined
  const parts = buildParts(params.prompt, resolvedImages)
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: params.temperature ?? 0.6,
      topP: params.topP ?? 0.95,
      maxOutputTokens: params.maxOutputTokens ?? 8192,
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
    const hint =
      res.status === 401
        ? 'Hint: Gemini requires an AI Studio key (GEMINI_API_KEY/GOOGLE_API_KEY). Vertex/Cloud API keys are rejected. Verify the key value and that billing is active in the same project.'
        : res.status === 429
          ? 'Hint: Gemini quota/rate limit exceeded in this project/region. Increase Vertex AI generative quotas or wait for reset.'
          : ''
    throw new Error(`Gemini API error (${res.status}): ${errText}${hint ? ' | ' + hint : ''}`)
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

/**
 * Extract one top-level JSON object from model output.
 * - Strips markdown code blocks (```json ... ``` or ``` ... ```).
 * - Finds the object by brace-matching from first '{' so trailing text with '}' is ignored.
 * - Removes trailing commas before } or ] so invalid JSON from the model is accepted.
 */
export function parseJsonObject<T = unknown>(raw: string): T {
  let text = raw.trim()
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) text = codeBlockMatch[1].trim()
  const start = text.indexOf('{')
  if (start === -1) throw new Error('Model output did not contain a JSON object')
  let depth = 0
  let end = -1
  const inString = (quote: string) => (i: number) => {
    let j = i
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue }
      if (text[j] === quote) return j
      j++
    }
    return -1
  }
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'") {
      const close = inString(c)(i + 1)
      if (close === -1) break
      i = close
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) throw new Error('Model output did not contain a complete JSON object')
  let jsonText = text.slice(start, end + 1)
  jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(jsonText) as T
  } catch (e) {
    throw new Error(`Invalid JSON from model: ${e instanceof Error ? e.message : String(e)}`)
  }
}
