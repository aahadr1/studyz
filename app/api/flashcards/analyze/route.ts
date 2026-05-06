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
const ANALYSIS_CHUNK_CHARS = 12_000   // smaller → fewer questions per call → less risk of token-limit truncation
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

// ────────────────────────────────────────────────────────────────────────────
// Deterministic detector for explicitly numbered lists.
//
// Many users paste lists like:
//
//     1. What is X?
//     2. Define Y.
//     ...
//     244. Compare Z and W.
//
// In that case the count IS the largest number in the sequence. We do not
// need to ask the LLM to count for us — it's a parsing problem, not an
// inference problem.
//
// The detector is permissive about formats:
//   1. ...        1) ...        1- ...        1 / ...
//   Q1. ...       Q.1 ...       Question 1: ...   N°1. ...
// ────────────────────────────────────────────────────────────────────────────
interface ExplicitNumbering {
  count: number
  unique: number
  max: number
  density: number  // unique / max  — how dense the sequence is
  positions: number[] // line offsets, for debug
}

function detectExplicitNumbering(text: string): ExplicitNumbering | null {
  const lines = text.split(/\r?\n/)
  const numbers: number[] = []
  const seen = new Set<number>()

  // Allowed prefixes: nothing, Q, N°, Question, exo, exercice, item, etc.
  // Allowed separators after the number: . ) - / : ° space
  const re = /^\s*(?:[-•*\u2022]\s*)?(?:(?:question|exercice|exo|item|n[\u00b0o]|q\.?)\s*)?(\d{1,4})\s*[\)\.\-\u2013\u2014\/:\u00b0]\s+/i

  for (const line of lines) {
    const m = line.match(re)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (!Number.isFinite(n) || n < 1 || n > 999) continue
    if (seen.has(n)) continue
    seen.add(n)
    numbers.push(n)
  }

  if (numbers.length < 5) return null

  numbers.sort((a, b) => a - b)
  const max = numbers[numbers.length - 1]
  const unique = numbers.length

  // Density check — at least 70% of the numbers from 1..max must be present.
  // This avoids confusing a few stray numbers (like dates or section IDs) with
  // a real numbered list.
  const density = unique / max

  // Also require the sequence to start near 1 (not 145..980)
  const startsNearOne = numbers[0] <= 3

  if (density < 0.7 || !startsNearOne) return null

  return {
    count: max,
    unique,
    max,
    density,
    positions: [],
  }
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

    // ── Step A: deterministic regex detection of explicit numbering ────────
    const explicit = detectExplicitNumbering(trimmed)
    if (explicit) {
      console.log(
        `[Flashcards/Analyze] Explicit numbering detected: count=${explicit.count}, unique=${explicit.unique}, density=${explicit.density.toFixed(2)}`
      )
    }

    // ── Step B: LLM enumeration in chunks (themes + sanity cross-check) ────
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
          max_tokens: 16000, // gpt-4o supports up to 16384 output tokens
          temperature: 0.0,
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

        const finishReason = response.choices[0]?.finish_reason
        const raw = response.choices[0]?.message?.content || ''
        if (finishReason === 'length') {
          console.warn(`[Flashcards/Analyze] Chunk ${i + 1} hit token limit (length); JSON may be truncated`)
        }

        const parsed = safeJsonParse<{ language?: string; questions?: ListedQ[] }>(raw, {
          questions: [],
        })

        if (parsed.language && detectedLanguage === 'unknown') {
          detectedLanguage = String(parsed.language).toLowerCase()
        }

        const list = Array.isArray(parsed.questions) ? parsed.questions : []
        console.log(
          `[Flashcards/Analyze] Chunk ${i + 1}: listed ${list.length} questions (finish_reason=${finishReason})`
        )

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

    // Dedupe across chunks
    const seen = new Set<string>()
    const unique: ListedQ[] = []
    for (const q of allListed) {
      const norm = normaliseForDedup(q.snippet).slice(0, 60)
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      unique.push(q)
      if (unique.length >= HARD_CAP) break
    }

    const llmCount = unique.length

    // ── Step C: pick the count ───────────────────────────────────────────
    // Rule of thumb:
    //   • If explicit numbering was detected, trust it (it's deterministic).
    //   • Otherwise, use the LLM unique count.
    //   • Take the max as a safety net — never report fewer questions than
    //     the largest reliable signal.
    let finalCount: number
    let countSource: 'explicit-numbering' | 'llm-enumeration' | 'max'
    if (explicit) {
      finalCount = Math.max(explicit.count, llmCount)
      countSource = explicit.count >= llmCount ? 'explicit-numbering' : 'max'
    } else {
      finalCount = llmCount
      countSource = 'llm-enumeration'
    }

    // Themes — top 16 by frequency
    const themes = [...themeFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([t]) => t)

    console.log(
      `[Flashcards/Analyze] FINAL: count=${finalCount} (source=${countSource}, llm=${llmCount}, explicit=${explicit?.count ?? 'none'})`
    )

    return NextResponse.json({
      estimated_question_count: finalCount,
      themes,
      language: detectedLanguage,
      noise_summary:
        countSource === 'explicit-numbering'
          ? `Detected an explicitly numbered list (1…${explicit?.max}). The count comes from the numbering itself.`
          : '',
      char_count: text.length,
      truncated: text.length > MAX_INPUT_CHARS,
      _debug: {
        chunks: chunks.length,
        raw_listed: allListed.length,
        unique_listed: llmCount,
        explicit_count: explicit?.count ?? null,
        explicit_density: explicit?.density ?? null,
        count_source: countSource,
      },
    })
  } catch (err: any) {
    console.error('[Flashcards/Analyze] error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
