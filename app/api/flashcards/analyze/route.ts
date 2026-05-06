import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  QUESTION_DETECTION_SYSTEM_PROMPT,
  createQuestionDetectionPrompt,
} from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const MAX_INPUT_CHARS = 200_000

function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

let openaiInstance: OpenAI | null = null
function getOpenAI() {
  if (!openaiInstance) openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiInstance
}

function safeJsonParse<T = any>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}

interface AnalyzeResult {
  estimated_question_count: number
  themes: string[]
  language: string
  noise_summary: string
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const text = String(body?.text || '').trim()

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: 'Provide at least 50 characters of text to analyze.' },
        { status: 400 }
      )
    }

    const trimmed = text.slice(0, MAX_INPUT_CHARS)
    const openai = getOpenAI()

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: QUESTION_DETECTION_SYSTEM_PROMPT },
        { role: 'user', content: createQuestionDetectionPrompt(trimmed) },
      ],
    })

    const raw = response.choices[0]?.message?.content || ''
    const parsed = safeJsonParse<AnalyzeResult>(raw, {
      estimated_question_count: 0,
      themes: [],
      language: 'unknown',
      noise_summary: '',
    })

    const count = Math.max(0, Math.min(500, Math.round(Number(parsed.estimated_question_count) || 0)))
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 20)
      : []

    return NextResponse.json({
      estimated_question_count: count,
      themes,
      language: String(parsed.language || 'unknown'),
      noise_summary: String(parsed.noise_summary || ''),
      char_count: text.length,
      truncated: text.length > MAX_INPUT_CHARS,
    })
  } catch (err: any) {
    console.error('[Flashcards/Analyze] error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
