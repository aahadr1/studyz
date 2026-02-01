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
  images?: string[] // data URLs (data:image/...;base64,...) or raw base64
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

/**
 * Extract and parse a JSON object from model output.
 * Handles markdown code blocks (```json ... ```) and plain JSON.
 */
export function parseJsonObject<T = unknown>(raw: string): T {
  let text = raw.trim()
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) text = codeBlockMatch[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model output did not contain a JSON object')
  }
  const jsonText = text.slice(first, last + 1)
  try {
    return JSON.parse(jsonText) as T
  } catch (e) {
    throw new Error(`Invalid JSON from model: ${e instanceof Error ? e.message : String(e)}`)
  }
}
