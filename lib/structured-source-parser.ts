/**
 * Structured-source parser for flashcards.
 *
 * Many users paste text that already contains explicit cards with both a
 * question AND an answer per card. Examples:
 *
 *   CARTE 001
 *   Question améliorée : ...
 *   Réponse flashcard : ...
 *   Réponse complète : ...
 *
 *   FICHE 12
 *   Question: ...
 *   Réponse: ...
 *
 *   Card 5
 *   Q: ...
 *   A: ...
 *
 * In these cases, the user does NOT want the AI to reformulate questions or
 * invent answers. They want the verbatim text turned directly into cards.
 *
 * This parser detects such structured sources and returns the cards 1:1, in
 * source order, with verbatim question and answer text. If the text isn't
 * structured (no recognisable card markers, or markers without paired Q/A),
 * the parser returns an empty array and the caller should fall back to the
 * LLM-based 2-phase flow.
 */

export interface StructuredCard {
  card_number: number
  prefix: string             // "CARTE", "FICHE", etc. (lowercased)
  original_number_raw: string
  question: string
  answer: string
  raw_block: string
}

// Labels we recognise for the QUESTION part of a card (case-insensitive).
// Order matters: more specific labels first.
const QUESTION_LABELS = [
  /^\s*question\s+(?:améliorée|reformul[ée]e|am[ée]lior[ée]e|de\s+suivi)\s*[:\-—]\s*/i,
  /^\s*(?:question|prompt|énoncé|enonce|consigne)\s*[:\-—]\s*/i,
  /^\s*q\s*[:\-—.)\]]\s*/i, // "Q:" "Q)"  "Q -"
]

// Labels we recognise for the ANSWER part of a card. Order matters: we prefer
// the most specific label because users often format the same card with
// multiple answer sections (e.g. flashcard answer + full source answer).
//
// We keep the order: short/flashcard answer first when present, otherwise
// fall back to the longer "full" answer.
const ANSWER_LABELS = [
  // Specific compact answer (preferred for flashcards)
  /^\s*r[ée]ponse\s+flashcard\s*[:\-—]\s*/i,
  // Full original answer
  /^\s*r[ée]ponse\s+compl[èe]te(?:\s+d['’]origine)?\s*[:\-—]\s*/i,
  // Explanation / justification
  /^\s*r[ée]ponse\s+(?:détaillée|detaillee|enrichie|d['’]oral)\s*[:\-—]\s*/i,
  // Generic answer label
  /^\s*(?:r[ée]ponse|reponse|réponses|answer|sol(?:ution)?|corrigé|corrige)\s*[:\-—]\s*/i,
  /^\s*a\s*[:\-—.)\]]\s*/i, // "A:" "A)"
]

// Labels we want to STRIP from the answer body because they are meta-comments,
// not actual answer content (the user's specific format includes a lot of
// these on every card).
const STRIPPABLE_TRAILING_LABELS = [
  /^\s*posture\s+à\s+montrer\s*[:\-—].*$/i,
  /^\s*méthode\s+à\s+mémoriser\s*[:\-—].*$/i,
  /^\s*phrase\s+de\s+conclusion(?:\s+possible)?\s*[:\-—].*$/i,
  /^\s*phrase\s+de\s+sécurité\s*[:\-—].*$/i,
  /^\s*construction\s+recommandée\s*[:\-—].*$/i,
  /^\s*mémo(?:\s+oral)?\s*[:\-—].*$/i,
  /^\s*à\s+l['’]oral.*$/i,
  /^\s*point\s+de\s+(?:vigilance|prudence)\s*[:\-—].*$/i,
  /^\s*flashcards?\s+oral.*$/i, // page-footer artifacts
]

// Lines we drop entirely (page footers, repeated headers, etc.)
const NOISE_LINE_PATTERNS = [
  /^\s*flashcards?\s+oral\s+cdc\s*\/\s*attaché\s+-\s+version\s+complète\s*$/i,
  /^\s*page\s+\d+\s*(?:\/\s*\d+)?\s*$/i,
]

// Strip leading bullet/quote markers
function stripLeading(line: string): string {
  return line.replace(/^[\s\u00a0>*\-•·#\u2022]+/, '')
}

/**
 * Detect the dominant prefix used in the text (e.g. "CARTE", "FICHE", "Card").
 * Returns null if no consistent prefix-numbering pattern is found.
 *
 * A prefix is "dominant" if at least 5 line-starts use the same prefix word
 * followed by a 1-4 digit number, AND those numbers form a sequence starting
 * near 1 (density >= 60%).
 */
function detectDominantPrefix(text: string): { prefix: string; positions: number[] } | null {
  // For each candidate prefix, collect line-start char-indices in source order.
  const groups = new Map<string, number[]>() // prefix -> array of source char indices
  const numbers = new Map<string, Set<number>>() // prefix -> set of numbers

  // Split with offsets to remember each line's char index in the original text
  let cursor = 0
  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    const lineStart = cursor
    cursor += rawLine.length + 1 // +1 for the \n

    const trimmed = stripLeading(rawLine.trim())
    if (!trimmed) continue

    // Match: prefix-word + space + number (1-4 digits)
    const m = trimmed.match(/^([\p{L}][\p{L}.\-]{0,28})\s+(\d{1,4})\b/u)
    if (!m) continue
    const prefix = m[1].toLowerCase().replace(/[.\-]+$/, '')
    const n = parseInt(m[2], 10)
    if (!Number.isFinite(n) || n < 1 || n > 999) continue

    if (!groups.has(prefix)) {
      groups.set(prefix, [])
      numbers.set(prefix, new Set())
    }
    groups.get(prefix)!.push(lineStart)
    numbers.get(prefix)!.add(n)
  }

  // Pick the prefix with the most distinct numbers, requiring at least 5
  let bestPrefix: string | null = null
  let bestUnique = 0
  for (const [prefix, nums] of numbers) {
    if (nums.size < 5) continue
    // Density check: how many of 1..max are present?
    const sorted = [...nums].sort((a, b) => a - b)
    const max = sorted[sorted.length - 1]
    const startsAt = sorted[0]
    if (startsAt > 5) continue
    const density = nums.size / max
    if (density < 0.6) continue
    if (nums.size > bestUnique) {
      bestUnique = nums.size
      bestPrefix = prefix
    }
  }

  if (!bestPrefix) return null
  return { prefix: bestPrefix, positions: groups.get(bestPrefix)! }
}

/**
 * Slice the source text at each occurrence of the prefix-number marker.
 * Each slice covers from one marker to the next (or to end of text).
 */
function sliceAtMarkers(text: string, prefix: string): Array<{ markerStart: number; rawNumber: string; block: string }> {
  // Build a regex that matches the marker line at the start of any line.
  // We escape the prefix to be safe.
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^\\s*${escapedPrefix}\\s+(\\d{1,4})\\b.*$`, 'gim')

  const matches: Array<{ start: number; end: number; rawNumber: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, rawNumber: m[1] })
    if (re.lastIndex === m.index) re.lastIndex++ // safety
  }

  if (matches.length === 0) return []

  const slices: Array<{ markerStart: number; rawNumber: string; block: string }> = []
  for (let i = 0; i < matches.length; i++) {
    const startOfBody = matches[i].end
    const endOfBlock = i + 1 < matches.length ? matches[i + 1].start : text.length
    const block = text.slice(startOfBody, endOfBlock)
    slices.push({
      markerStart: matches[i].start,
      rawNumber: matches[i].rawNumber,
      block,
    })
  }
  return slices
}

/**
 * Within a card block, find the first occurrence of any of the labels and
 * return its position + the matched label length (so we can capture the body
 * after the label).
 */
function findFirstLabel(block: string, labels: RegExp[]): { index: number; matchLen: number } | null {
  // We scan line by line so that "Question" embedded in another sentence
  // doesn't get mis-detected as a label.
  let cursor = 0
  for (const line of block.split(/\r?\n/)) {
    const lineLen = line.length + 1 // +1 newline
    for (const labelRe of labels) {
      const m = line.match(labelRe)
      if (m && m.index === 0) {
        return { index: cursor, matchLen: m[0].length }
      }
    }
    cursor += lineLen
  }
  return null
}

/**
 * Extract the body that follows the label until either the next labelled
 * section or until a strippable trailing label.
 */
function extractLabelledBody(
  block: string,
  startIndex: number,
  matchLen: number,
  stopLabels: RegExp[]
): string {
  const after = block.slice(startIndex + matchLen)
  // Find the earliest stop position by scanning lines.
  let cursor = 0
  let stopAt = after.length
  for (const line of after.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (cursor > 0 && stopLabels.some((re) => re.test(trimmed))) {
      stopAt = cursor
      break
    }
    cursor += line.length + 1
  }
  return after.slice(0, stopAt).trim()
}

/**
 * Strip trailing meta-comments (posture, méthode, phrase de conclusion, etc.)
 * from an answer body, plus any noise lines.
 */
function cleanAnswerBody(body: string): string {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (NOISE_LINE_PATTERNS.some((re) => re.test(trimmed))) continue
    if (STRIPPABLE_TRAILING_LABELS.some((re) => re.test(trimmed))) {
      // Stop at the first strippable label — everything after is meta-content
      break
    }
    out.push(raw)
  }
  return out.join('\n').trim()
}

/**
 * Public API.
 */
export function parseStructuredCards(text: string): StructuredCard[] {
  if (!text || text.length < 50) return []

  const detected = detectDominantPrefix(text)
  if (!detected) return []

  const slices = sliceAtMarkers(text, detected.prefix)
  if (slices.length < 5) return []

  const cards: StructuredCard[] = []
  for (let i = 0; i < slices.length; i++) {
    const { rawNumber, block } = slices[i]

    // Combine all answer-bearing labels into a single stop-set for body capture
    const allLabels = [...QUESTION_LABELS, ...ANSWER_LABELS]

    // Question: locate the first question label
    const qLoc = findFirstLabel(block, QUESTION_LABELS)
    if (!qLoc) continue

    const questionBody = extractLabelledBody(block, qLoc.index, qLoc.matchLen, allLabels).trim()
    if (!questionBody || questionBody.length < 5) continue

    // Answer: find the first answer label AFTER the question section
    const blockAfterQuestion = block.slice(qLoc.index + qLoc.matchLen + questionBody.length)
    const aLoc = findFirstLabel(blockAfterQuestion, ANSWER_LABELS)
    if (!aLoc) continue
    const answerBodyRaw = extractLabelledBody(
      blockAfterQuestion,
      aLoc.index,
      aLoc.matchLen,
      allLabels
    )
    const answerBody = cleanAnswerBody(answerBodyRaw)
    if (!answerBody || answerBody.length < 5) continue

    cards.push({
      card_number: i + 1,
      prefix: detected.prefix,
      original_number_raw: rawNumber,
      question: questionBody,
      answer: answerBody,
      raw_block: block,
    })
  }

  return cards
}
