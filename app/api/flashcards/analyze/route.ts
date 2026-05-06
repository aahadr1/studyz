import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  QUESTION_LISTING_SYSTEM_PROMPT,
  createQuestionListingPrompt,
} from '@/lib/prompts'
import { countQuestions } from '@/lib/question-counter'

export const runtime = 'nodejs'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

// Tunables
//   • DETERMINISTIC_MAX_CHARS — regex parser is O(n), can comfortably handle
//     1MB of text. We use a generous cap so very large numbered lists (e.g.
//     500 cards × 2k chars each) are counted accurately.
//   • LLM_MAX_INPUT_CHARS — what we feed to the LLM (still chunked). This is
//     more conservative because LLM cost scales linearly.
const DETERMINISTIC_MAX_CHARS = 1_500_000
const LLM_MAX_INPUT_CHARS = 200_000
const ANALYSIS_CHUNK_CHARS = 12_000
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

    // ────────────────────────────────────────────────────────────────────
    // Strategy A — deterministic multi-strategy parser (no LLM)
    //   We run it on the FULL text (up to 1.5MB) so that very long numbered
    //   pastes are still counted correctly. Truncating before this step is
    //   what caused "244 cards → 105 detected" on long inputs.
    // ────────────────────────────────────────────────────────────────────
    const detText = text.slice(0, DETERMINISTIC_MAX_CHARS)
    const detected = countQuestions(detText)
    console.log(
      `[Flashcards/Analyze] Deterministic on ${detText.length} chars (full=${text.length}):`,
      JSON.stringify(detected, null, 2)
    )

    // ────────────────────────────────────────────────────────────────────
    // Strategy B — LLM enumeration (used for theme detection + as a
    // sanity check). We still run it because we need themes for grouping.
    //   The LLM only ever sees the truncated text. The deterministic count
    //   above remains the source of truth for explicitly numbered lists.
    // ────────────────────────────────────────────────────────────────────
    const trimmed = text.slice(0, LLM_MAX_INPUT_CHARS)
    const chunks = chunkText(trimmed, ANALYSIS_CHUNK_CHARS, ANALYSIS_CHUNK_OVERLAP)
    const openai = getOpenAI()

    const allListed: ListedQ[] = []
    let detectedLanguage = 'unknown'
    const themeFrequency = new Map<string, number>()

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`[Flashcards/Analyze] LLM chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`)

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 16000,
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
          console.warn(`[Flashcards/Analyze] LLM chunk ${i + 1} hit token limit`)
        }

        const parsed = safeJsonParse<{ language?: string; questions?: ListedQ[] }>(raw, {
          questions: [],
        })

        if (parsed.language && detectedLanguage === 'unknown') {
          detectedLanguage = String(parsed.language).toLowerCase()
        }

        const list = Array.isArray(parsed.questions) ? parsed.questions : []
        console.log(
          `[Flashcards/Analyze] LLM chunk ${i + 1}: listed ${list.length} questions (finish=${finishReason})`
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
        console.error(`[Flashcards/Analyze] LLM chunk ${i + 1} failed:`, err.message)
      }
    }

    // Dedupe across chunks for the LLM count
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

    // ────────────────────────────────────────────────────────────────────
    // Decide the final count.
    //
    //   • Deterministic detection wins if its confidence is >= 0.6.
    //     In practice that means: a numbered list with density >= 0.7
    //     starting near 1. We trust this absolutely.
    //   • Otherwise, take the max of (deterministic count, LLM count) so
    //     we never undercount.
    // ────────────────────────────────────────────────────────────────────
    const bestStrategy = detected.strategies
      .filter((s) => s.count > 0)
      .sort((a, b) => b.confidence - a.confidence)[0]

    let finalCount: number
    let countSource: string
    if (bestStrategy && bestStrategy.confidence >= 0.6) {
      finalCount = Math.max(bestStrategy.count, llmCount)
      countSource = bestStrategy.count >= llmCount ? `det:${bestStrategy.name}` : 'det+llm:max'
    } else {
      finalCount = Math.max(detected.count, llmCount)
      countSource = detected.count > llmCount ? `det:${detected.source}` : 'llm-enumeration'
    }

    finalCount = Math.min(HARD_CAP, finalCount)

    // Themes — top 16 by frequency
    const themes = [...themeFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([t]) => t)

    let noiseSummary = ''
    if (
      countSource.startsWith('det:line-prefix') ||
      countSource.startsWith('det:inline') ||
      countSource.startsWith('det:any-prefix')
    ) {
      const prefix = (bestStrategy?.details as any)?.prefix
      const prefixLabel = prefix && typeof prefix === 'string' ? ` ("${prefix.toUpperCase()} N…")` : ''
      noiseSummary = `Detected an explicitly numbered list (1…${finalCount})${prefixLabel}. The count comes from the numbering itself, not from AI estimation.`
    } else if (countSource === 'llm-enumeration') {
      noiseSummary = `No clear numbering detected. The count comes from an AI enumeration of every question.`
    }

    console.log(
      `[Flashcards/Analyze] FINAL: count=${finalCount}, source=${countSource}, llm=${llmCount}, det.best=${bestStrategy?.name ?? 'none'}@${bestStrategy?.count ?? 0} (conf ${bestStrategy?.confidence?.toFixed(2) ?? 'n/a'})`
    )

    return NextResponse.json({
      estimated_question_count: finalCount,
      themes,
      language: detectedLanguage,
      noise_summary: noiseSummary,
      char_count: text.length,
      truncated: text.length > LLM_MAX_INPUT_CHARS,
      _debug: {
        chunks: chunks.length,
        raw_listed: allListed.length,
        unique_listed: llmCount,
        deterministic: detected,
        count_source: countSource,
        det_chars: detText.length,
        llm_chars: trimmed.length,
        full_chars: text.length,
      },
    })
  } catch (err: any) {
    console.error('[Flashcards/Analyze] error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
