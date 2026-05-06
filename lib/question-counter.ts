/**
 * Robust deterministic question counter.
 *
 * Designed to "never" undercount on numbered lists by running MANY independent
 * detection strategies in parallel and reporting the best signal.
 *
 * Strategies:
 *   1. Line-prefix numbering — "1." "1)" "1-" "Q1." "Question 1:" "N°1"
 *      "Exercice 1" "Item 1" "(1)" "[1]" with bullets / markdown bold.
 *   2. Inline numbering — same patterns but anywhere in the text (compact
 *      one-line lists, paragraphs with embedded numbers).
 *   3. Loose leading-digit — any line that starts with a digit followed by
 *      anything (very permissive, low confidence).
 *   4. Question marks — count lines ending with "?".
 *   5. Imperative starters — count lines starting with "Define / Explain /
 *      Compare / List / What / How / Why / Quel / Comment / Pourquoi /
 *      Donnez / Définir …".
 *
 * Each strategy returns a count + a confidence score. We then pick the
 * largest count among the strategies with the highest confidence.
 */

export interface CountStrategyResult {
  name: string
  count: number
  confidence: number       // 0..1
  details?: Record<string, any>
}

export interface QuestionCountResult {
  count: number
  source: string
  strategies: CountStrategyResult[]
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const FRENCH_INTERROGATIVE = /^(quel(le|les|s)?|comment|pourquoi|où|quand|combien|qu['e]|qu'est-ce|de quoi|à quoi|d'où|que )/i
const ENGLISH_INTERROGATIVE = /^(what|why|how|when|where|which|who|whom|whose|do |does |did |is |are |was |were |can |could |should |would |will |has |have )/i
const IMPERATIVE_VERBS = /^(define|explain|describe|compare|list|state|name|identify|enumerate|cite|donnez|d[ée]finir|d[ée]finis(sez|s)?|expliqu(er|ez|e)|d[ée]cri(re|s|vez)|compar(er|ez|e)|list(er|ez|e)|cit(er|ez|e)|énumér(er|ez|e)|nomm(er|ez|e)|identifi(er|ez|e))/i

// Reusable line-prefix patterns. Each must put the captured number in group 1.
const LINE_PREFIX_PATTERNS: Array<[RegExp, string]> = [
  // **1.**, **1)** (markdown bold)
  [/^\s*\*\*\s*(\d{1,4})\s*\*\*\s*[\.\)\-\u2013\u2014\:\u00b0\/]?/, 'md-bold'],
  // Q1., Q.1, Q-1, Q 1
  [/^\s*Q\s*[\.\-]?\s*(\d{1,4})\b/i, 'q-style'],
  // N°1, N°.1, n°1, no 1
  [/^\s*N\s*[°o\u00ba\u00b0]\s*\.?\s*(\d{1,4})\b/i, 'n-degree'],
  // Question 1, Questions 1 (with optional ":" or ".")
  [/^\s*Questions?\s+(\d{1,4})\s*[:\.\)\-]?/i, 'question-prefix'],
  // Exercice 1, Exo 1, Item 1, Problème 1
  [/^\s*(?:Exercice|Exo|Item|Probl[eè]me)\s+(\d{1,4})\b/i, 'exercice-prefix'],
  // (1), [1], {1}
  [/^\s*[\(\[\{]\s*(\d{1,4})\s*[\)\]\}]/, 'bracketed'],
  // 1., 1), 1-, 1:, 1/, 1° — the most common case
  [/^\s*(\d{1,4})\s*[\.\)\-\u2013\u2014\:\u00b0\/]/, 'std-separator'],
  // 1<space>Word — number followed by a space and a word (no separator)
  [/^\s*(\d{1,4})\s+[\p{L}]/u, 'number-space-word'],
]

// Compact / inline patterns — run on the WHOLE text (after newline normalisation),
// to handle pastes where everything is on a single line or where numbering
// markers are inside paragraphs.
const INLINE_PATTERNS: Array<[RegExp, string]> = [
  // " 1. Word" — number, dot, space, capital letter (catches mid-paragraph markers)
  [/(?:^|[\s.?!\u2026])(\d{1,4})\s*[.)\-\u2013\u2014]\s+(?=[\p{Lu}\p{Ll}\u00C0-\u017F])/gu, 'inline-std'],
  // " Q1. Word"
  [/(?:^|\s)Q\.?\s*(\d{1,4})\s*[.)\-]\s+/gi, 'inline-q'],
]

// Strip leading punctuation/markers that would otherwise prevent matching.
function stripLeading(line: string): string {
  return line.replace(/^[\s\u00a0>*\-•·#\u2022]+/, '')
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy 1 — line-prefix numbering
// ────────────────────────────────────────────────────────────────────────────

function strategyLinePrefix(text: string): CountStrategyResult {
  const lines = text.split(/\r?\n/)
  const numbers = new Set<number>()
  const formatHits = new Map<string, number>()

  for (const line of lines) {
    if (!line.trim()) continue
    const cleaned = stripLeading(line)
    for (const [pattern, label] of LINE_PREFIX_PATTERNS) {
      const m = cleaned.match(pattern)
      if (m) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && n >= 1 && n <= 999) {
          numbers.add(n)
          formatHits.set(label, (formatHits.get(label) || 0) + 1)
        }
        break // one format match per line is enough
      }
    }
  }

  return finaliseSequence('line-prefix', numbers, { formats: Object.fromEntries(formatHits) })
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy 2 — inline numbering (compact / one-line lists)
// ────────────────────────────────────────────────────────────────────────────

function strategyInline(text: string): CountStrategyResult {
  const numbers = new Set<number>()
  const formatHits = new Map<string, number>()

  for (const [pattern, label] of INLINE_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
    const re = new RegExp(pattern.source, flags)
    const matches = text.matchAll(re)
    for (const m of matches) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n >= 1 && n <= 999) {
        numbers.add(n)
        formatHits.set(label, (formatHits.get(label) || 0) + 1)
      }
    }
  }

  return finaliseSequence('inline', numbers, { formats: Object.fromEntries(formatHits) })
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy 3 — loose: any line starting with a digit
// ────────────────────────────────────────────────────────────────────────────

function strategyLoose(text: string): CountStrategyResult {
  const lines = text.split(/\r?\n/)
  const numbers = new Set<number>()

  for (const line of lines) {
    const cleaned = stripLeading(line)
    const m = cleaned.match(/^(\d{1,4})/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n >= 1 && n <= 999) numbers.add(n)
    }
  }

  // Lower confidence — could include random numbers like dates.
  return finaliseSequence('loose-leading-digit', numbers, {}, { confidencePenalty: 0.25 })
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy 4 — question marks: count lines ending with "?"
// ────────────────────────────────────────────────────────────────────────────

function strategyQuestionMarks(text: string): CountStrategyResult {
  const lines = text.split(/\r?\n/)
  let count = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.endsWith('?') || trimmed.endsWith('？')) count++
  }
  return {
    name: 'question-marks',
    count,
    confidence: count >= 5 ? 0.6 : 0.0,
    details: {},
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy 5 — imperative starters / interrogative starters
// ────────────────────────────────────────────────────────────────────────────

function strategyImperatives(text: string): CountStrategyResult {
  const lines = text.split(/\r?\n/)
  let count = 0
  for (const line of lines) {
    const cleaned = stripLeading(line.trim())
    if (!cleaned) continue
    // Strip a leading number like "1. " so we evaluate the verb after it
    const afterNumber = cleaned.replace(/^\d{1,4}\s*[\.\)\-\u2013\u2014\:\u00b0\/]\s*/, '')
    if (
      IMPERATIVE_VERBS.test(afterNumber) ||
      FRENCH_INTERROGATIVE.test(afterNumber) ||
      ENGLISH_INTERROGATIVE.test(afterNumber)
    ) {
      count++
    }
  }
  return {
    name: 'imperative-or-interrogative-starters',
    count,
    confidence: count >= 5 ? 0.55 : 0.0,
    details: {},
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sequence finaliser — turns a set of numbers into a count by finding the
// largest contiguous-enough run starting near 1.
// ────────────────────────────────────────────────────────────────────────────

function finaliseSequence(
  name: string,
  numbers: Set<number>,
  details: Record<string, any> = {},
  opts: { confidencePenalty?: number } = {}
): CountStrategyResult {
  if (numbers.size < 3) {
    return { name, count: 0, confidence: 0, details: { ...details, reason: 'too-few-numbers' } }
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  const startsAt = sorted[0]
  const max = sorted[sorted.length - 1]
  const unique = sorted.length

  if (startsAt > 5) {
    return {
      name,
      count: 0,
      confidence: 0,
      details: { ...details, reason: 'starts-too-late', startsAt, max, unique },
    }
  }

  // Find largest M (>= 5) such that at least 70% of 1..M is present.
  let count = 0
  for (let candidateMax = max; candidateMax >= 5; candidateMax--) {
    const inRange = sorted.filter((n) => n <= candidateMax).length
    if (inRange / candidateMax >= 0.7) {
      count = candidateMax
      break
    }
  }

  if (count < 5) {
    return {
      name,
      count: 0,
      confidence: 0,
      details: { ...details, reason: 'low-density', startsAt, max, unique },
    }
  }

  // Confidence depends on density and how close startsAt is to 1
  const inRange = sorted.filter((n) => n <= count).length
  const density = inRange / count
  let confidence = 0.6 + Math.min(0.4, (density - 0.7) * 1.3) // 0.6..1.0
  if (startsAt > 1) confidence -= 0.05
  confidence -= opts.confidencePenalty ?? 0

  return {
    name,
    count,
    confidence: Math.max(0, Math.min(1, confidence)),
    details: { ...details, startsAt, max, unique, density: +density.toFixed(3) },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export function countQuestions(text: string): QuestionCountResult {
  const strategies: CountStrategyResult[] = [
    strategyLinePrefix(text),
    strategyInline(text),
    strategyLoose(text),
    strategyQuestionMarks(text),
    strategyImperatives(text),
  ]

  // Pick the best signal:
  //   1. Among strategies with confidence >= 0.6, take the one with the
  //      LARGEST count. (Numbered list signals dominate when present.)
  //   2. Otherwise, take the strategy with the highest confidence-weighted
  //      count.
  const strong = strategies.filter((s) => s.confidence >= 0.6 && s.count > 0)

  let chosen: CountStrategyResult | undefined
  if (strong.length > 0) {
    chosen = strong.reduce((a, b) => (b.count > a.count ? b : a))
  } else {
    const ranked = [...strategies]
      .filter((s) => s.count > 0)
      .sort((a, b) => b.confidence * b.count - a.confidence * a.count)
    chosen = ranked[0]
  }

  return {
    count: chosen?.count ?? 0,
    source: chosen?.name ?? 'none',
    strategies,
  }
}
