import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  QUESTION_LISTING_SYSTEM_PROMPT,
  createQuestionListingPrompt,
} from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

// Tunables
const MAX_INPUT_CHARS = 200_000
const ANALYSIS_CHUNK_CHARS = 18_000  // smaller than Phase 1 (22k) for output headroom
const ANALYSIS_CHUNK_OVERLAP = 600
const HARD_CAP = 500

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

function chunkText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text]
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + size, text.length)
    out.push(text.slice(i, end))
    if (end >= text.length) break
    i = end - overlap
  }
  return out
}

function normaliseForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

interface ListedQ {
  n?: number
  snippet: string
  theme: string
  original_number: string | null
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
    const chunks = chunkText(trimmed, ANALYSIS_CHUNK_CHARS, ANALYSIS_CHUNK_OVERLAP)

    const openai = getOpenAI()

    const allListed: ListedQ[] = []
    let detectedLanguage = 'unknown'
    const themeFrequency = new Map<string, number>()

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`[Flashcards/Analyze] Chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`)

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 8000, // generous: snippets per question are small but we want 200+
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: QUESTION_LISTING_SYSTEM_PROMPT },
            {
              role: 'user',
              content: createQuestionListingPrompt(chunk, {
                chunkIndex: i,
                totalChunks: chunks.length,
                runningCountSoFar: allListed.length,
                knownThemes: [...themeFrequency.keys()].slice(0, 12),
              }),
            },
          ],
        })

        const raw = response.choices[0]?.message?.content || ''
        const parsed = safeJsonParse<{ language?: string; questions?: ListedQ[] }>(raw, {
          questions: [],
        })

        if (parsed.language && detectedLanguage === 'unknown') {
          detectedLanguage = String(parsed.language).toLowerCase()
        }

        const list = Array.isArray(parsed.questions) ? parsed.questions : []
        console.log(`[Flashcards/Analyze] Chunk ${i + 1}: listed ${list.length} questions`)

        for (const q of list) {
          const snippet = String(q.snippet || '').trim()
          if (!snippet || snippet.length < 5) continue
          const theme = String(q.theme || 'Misc').trim() || 'Misc'
          allListed.push({
            n: q.n,
            snippet,
            theme,
            original_number: q.original_number ? String(q.original_number) : null,
          })
          themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
        }
      } catch (err: any) {
        console.error(`[Flashcards/Analyze] Chunk ${i + 1} failed:`, err.message)
      }
    }

    // Dedupe across chunks using a normalised prefix of the snippet (overlap zone safety)
    const seen = new Set<string>()
    const unique: ListedQ[] = []
    for (const q of allListed) {
      const norm = normaliseForDedup(q.snippet).slice(0, 60)
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      unique.push(q)
      if (unique.length >= HARD_CAP) break
    }

    // Sort themes by frequency, top 16
    const themes = [...themeFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([t]) => t)

    const count = unique.length

    console.log(
      `[Flashcards/Analyze] FINAL: ${count} unique questions across ${chunks.length} chunk(s) (raw before dedup: ${allListed.length})`
    )

    return NextResponse.json({
      estimated_question_count: count,
      themes,
      language: detectedLanguage,
      noise_summary: '',
      char_count: text.length,
      truncated: text.length > MAX_INPUT_CHARS,
      // Diagnostics — shown in dev tools, ignored by the UI
      _debug: {
        chunks: chunks.length,
        raw_listed: allListed.length,
        unique_listed: unique.length,
      },
    })
  } catch (err: any) {
    console.error('[Flashcards/Analyze] error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
