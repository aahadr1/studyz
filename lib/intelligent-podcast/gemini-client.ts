/**
 * Google Gemini LLM client via REST.
 * - AI Studio (generativelanguage.googleapis.com): use GEMINI_API_KEY or GOOGLE_API_KEY.
 * - Vertex AI (aiplatform.googleapis.com): use GOOGLE_CLOUD_API_KEY (Cloud Console key).
 * Cloud keys get 401 on generativelanguage; Vertex accepts them.
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

const AI_STUDIO_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const VERTEX_BASE = 'https://aiplatform.googleapis.com/v1'
const DEFAULT_MODEL = 'gemini-2.0-flash'

function getGeminiConfig(): { url: string; apiKey: string; isVertex: boolean } {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const cloudKey = process.env.GOOGLE_CLOUD_API_KEY

  if (geminiKey) {
    return {
      url: `${AI_STUDIO_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      apiKey: geminiKey,
      isVertex: false,
    }
  }
  if (cloudKey) {
    return {
      url: `${VERTEX_BASE}/publishers/google/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(cloudKey)}`,
      apiKey: cloudKey,
      isVertex: true,
    }
  }
  throw new Error(
    'Set GEMINI_API_KEY or GOOGLE_API_KEY (AI Studio) or GOOGLE_CLOUD_API_KEY (Vertex AI) for the podcast creator.'
  )
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
 * Build contents[].parts: text first, then each image.
 * AI Studio uses snake_case (inline_data, mime_type); Vertex uses camelCase (inlineData, mimeType).
 */
function buildParts(
  prompt: string,
  images: string[] | undefined,
  isVertex: boolean
): Array<{ text?: string; inline_data?: { mime_type: string; data: string }; inlineData?: { mimeType: string; data: string } }> {
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string }; inlineData?: { mimeType: string; data: string } }> = []
  if (prompt) parts.push({ text: prompt })
  if (images?.length) {
    for (const img of images) {
      const { mimeType, data } = parseImageForApi(img)
      if (isVertex) parts.push({ inlineData: { mimeType, data } })
      else parts.push({ inline_data: { mime_type: mimeType, data } })
    }
  }
  return parts
}

/**
 * Call Google Gemini generateContent (text + optional images). One request, no polling.
 */
export async function runGemini3Flash(params: GeminiRunParams): Promise<string> {
  const { url, isVertex } = getGeminiConfig()

  const parts = buildParts(params.prompt, params.images, isVertex)
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
    body[isVertex ? 'systemInstruction' : 'system_instruction'] = {
      parts: [{ text: params.systemInstruction }],
    }
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
