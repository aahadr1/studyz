/**
 * Clean up the 244 starter-deck cards: remove the standardized
 * "instruction" suffixes appended to most questions, and the trailing
 * coaching / meta paragraphs glued onto some answers. The actual
 * substance of every question and answer is preserved verbatim.
 *
 * Usage:
 *   npx tsx scripts/clean-starter-deck.ts
 *
 * Mutates data/starter-deck/stack-*.json in place. Run once.
 */

import * as fs from 'fs'
import * as path from 'path'

const dir = path.join(process.cwd(), 'data', 'starter-deck')

interface Card { n: number; front: string; back: string }
interface Stack { stack_number: number; cards: Card[] }

// ── Patterns repeated across many questions (instruction wrappers) ───
//
// These are formulaic "answer-this-way" instructions appended to the
// real question. Removing them keeps the actual question intact while
// dropping the convoluted boilerplate the user complained about.
const QUESTION_BOILERPLATES: string[] = [
  'Expliquez clairement la notion, son intérêt et son lien avec vos missions.',
  'Répondez de manière structurée, avec une position claire, professionnelle et mémorisable.',
  'Donnez les éléments précis attendus, puis expliquez leur portée concrète pour un cadre public.',
  'Répondez comme un cadre public : objectivation des faits, écoute, rappel du cadre, solution proportionnée et traçabilité.',
  'Nuancez votre position, identifiez les enjeux, les limites et le lien avec les valeurs du service public.',
  'Dans votre réponse, montrez votre méthode, votre posture de cadre et la manière dont vous sécurisez la décision.',
]

// ── Patterns appended to many answers (coaching / meta) ──────────────
//
// These were tutor-style notes blended into the flashcard back. They
// repeat across whole stacks and add no per-card information.
const ANSWER_TRAILING_REGEX: RegExp[] = [
  // Stack 3 "Phrase de sécurité" disclaimer (36 cards).
  /\s*Phrase de sécurité\s*:\s*«[^»]*»\s*\.?\s*$/u,

  // Stack 11/12 final coaching block: "À l'oral, la bonne réponse doit
  // rester personnelle..." — appears inline at the end of stack 2 cards.
  /\s*À l['’]oral,\s*la bonne réponse doit rester personnelle[\s\S]*$/u,

  // Stack 7 memorization mantra appended after the answer.
  /\s*Pour mémoriser,\s*rattachez toujours[\s\S]*$/u,

  // Stack 10 memo block.
  /\s*Pour retenir ce bloc,\s*pensez toujours[\s\S]*$/u,

  // Generic "Phrase utile : « ... »" appended in stack 7.
  /\s*Phrase utile\s*:\s*«[^»]*»\s*\.?\s*$/u,

  // Stack 7 stock quote about CDC's specificity — repeated verbatim
  // as a coda on 13 cards. The substance is already in each answer
  // body; the trailing quote is pure filler.
  /\s*«\s*La spécificité de la Caisse des Dépôts est d['’]articuler puissance financière, sécurité institutionnelle et utilité publique[^»]*»\s*\.?\s*$/u,
]

// Sentences that, when they appear, mark the start of a generic
// coaching/meta block that runs until the end of the answer. The
// regex strips from the matched position onward.
const COACHING_BLOCK_START_RES: RegExp[] = [
  // Stack 8 "RH" coaching block.
  /\s*(?:Le |le )?jury\s+RH\s+attend\s+une\s+réponse[\s\S]*$/u,
  /\s*La posture attendue n['’]est pas punitive[\s\S]*$/u,
  /\s*(?:dans|Dans) les questions RH,\s*utilisez souvent les mots[\s\S]*$/u,

  // Stack 9 actualité coaching block.
  /\s*À l['’]oral,\s*l['’]actualité doit rester un appui[\s\S]*$/u,
  /\s*Donnez le fait clé, puis expliquez son lien avec la Caisse des Dépôts[\s\S]*$/u,

  // Generic "sur les questions sensibles..." memo.
  /\s*sur les questions sensibles,\s*la bonne réponse commence souvent par[\s\S]*$/u,
]

function stripQuestionBoilerplate(q: string): string {
  let out = q.trim()
  // Apply repeatedly: some questions have two stacked boilerplates.
  let changed = true
  while (changed) {
    changed = false
    for (const phrase of QUESTION_BOILERPLATES) {
      // Match the phrase at the very end, optionally preceded by "» " etc.
      const idx = out.lastIndexOf(phrase)
      if (idx >= 0 && idx + phrase.length >= out.length - 2) {
        out = out.slice(0, idx).trim()
        // Trim any dangling closing quote/space left by the cut.
        out = out.replace(/[\s»]+$/u, '').trim()
        // Re-add a closing punctuation if we stripped one.
        if (out && !/[.!?]$/.test(out)) out += '.'
        changed = true
        break
      }
    }
  }
  // Collapse any double spaces left behind.
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out
}

function stripAnswerTrailings(a: string): string {
  let out = a.trim()
  let changed = true
  while (changed) {
    changed = false
    // First, strip well-known trailing patterns.
    for (const re of ANSWER_TRAILING_REGEX) {
      const next = out.replace(re, '')
      if (next !== out) {
        out = next.trim()
        changed = true
      }
    }
    // Then, strip any coaching block (everything from the marker on).
    for (const re of COACHING_BLOCK_START_RES) {
      const next = out.replace(re, '')
      if (next !== out) {
        out = next.trim()
        changed = true
      }
    }
  }
  // Collapse internal whitespace and ensure a final period.
  out = out.replace(/\s{2,}/g, ' ').trim()
  if (out && !/[.!?»"]$/.test(out)) out += '.'
  return out
}

function processCard(c: Card): Card {
  return {
    n: c.n,
    front: stripQuestionBoilerplate(c.front),
    back: stripAnswerTrailings(c.back),
  }
}

function main() {
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  let totalCards = 0
  let questionsShortened = 0
  let answersShortened = 0
  let qCharsBefore = 0
  let qCharsAfter = 0
  let aCharsBefore = 0
  let aCharsAfter = 0

  for (const meta of manifest.stacks) {
    const file = path.join(dir, meta.file)
    const stack: Stack = JSON.parse(fs.readFileSync(file, 'utf8'))

    const cleaned: Card[] = stack.cards.map((c) => {
      const out = processCard(c)
      totalCards++
      qCharsBefore += c.front.length
      qCharsAfter += out.front.length
      aCharsBefore += c.back.length
      aCharsAfter += out.back.length
      if (out.front !== c.front) questionsShortened++
      if (out.back !== c.back) answersShortened++
      return out
    })

    fs.writeFileSync(
      file,
      JSON.stringify({ stack_number: stack.stack_number, cards: cleaned }, null, 2) + '\n',
      'utf8'
    )
    console.log(`Stack ${meta.number}: ${stack.cards.length} cards processed.`)
  }

  console.log('---')
  console.log(`Total cards: ${totalCards}`)
  console.log(`Questions shortened: ${questionsShortened}/${totalCards}`)
  console.log(`Answers shortened: ${answersShortened}/${totalCards}`)
  console.log(`Question chars: ${qCharsBefore} → ${qCharsAfter} (-${(100 * (1 - qCharsAfter / qCharsBefore)).toFixed(1)}%)`)
  console.log(`Answer chars:   ${aCharsBefore} → ${aCharsAfter} (-${(100 * (1 - aCharsAfter / aCharsBefore)).toFixed(1)}%)`)
}

main()
