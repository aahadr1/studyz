type GeminiThinkingLevel = 'low' | 'high'

interface GeminiRunParams {
  prompt: string
  systemInstruction?: string
  images?: string[]
  thinkingLevel?: GeminiThinkingLevel
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

let cachedGeminiVersion: string | null = null

async function getLatestGeminiVersion(): Promise<string> {
  if (cachedGeminiVersion) return cachedGeminiVersion

  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not set (required for Gemini)')
  }

  const resp = await fetch('https://api.replicate.com/v1/models/google/gemini-3-flash', {
    headers: { Authorization: `Bearer ${apiToken}` },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Failed to fetch Gemini model version (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  const version = data?.latest_version?.id
  if (!version) {
    throw new Error('Replicate did not return latest_version.id for google/gemini-3-flash')
  }

  cachedGeminiVersion = String(version)
  return cachedGeminiVersion
}

function normalizeOutput(output: any): string {
  if (Array.isArray(output)) {
    return output.map((x) => String(x)).join('')
  }
  if (typeof output === 'string') return output
  return String(output ?? '')
}

export async function runGemini3Flash(params: GeminiRunParams): Promise<string> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not set (required for Gemini)')
  }

  const version = await getLatestGeminiVersion()

  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version,
      input: {
        prompt: params.prompt,
        images: params.images || [],
        system_instruction: params.systemInstruction,
        thinking_level: params.thinkingLevel || 'high',
        temperature: params.temperature ?? 0.6,
        top_p: params.topP ?? 0.95,
        max_output_tokens: params.maxOutputTokens ?? 65535,
      },
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Replicate error ${createResponse.status}: ${errorText}`)
  }

  let prediction = await createResponse.json()
  let attempts = 0
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 180) {
    await new Promise((r) => setTimeout(r, 1000))
    const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    prediction = await pollResponse.json()
    attempts++
  }

  if (prediction.status === 'failed') {
    throw new Error(prediction.error || 'Gemini generation failed')
  }
  if (!prediction.output) {
    throw new Error('Gemini timed out or returned no output')
  }

  return normalizeOutput(prediction.output)
}

export function parseJsonObject<T = any>(raw: string): T {
  const text = raw.trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model output did not contain a JSON object')
  }
  const jsonText = text.slice(first, last + 1)
  return JSON.parse(jsonText) as T
}

