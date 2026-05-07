/**
 * Test the structured-source parser against the user's "CARTE NNN" format
 * and a few other common variations.
 *
 * Run with:
 *   npx tsx scripts/test-structured-parser.ts
 */
import { parseStructuredCards } from '../lib/structured-source-parser'

function makeCarteText(n: number): string {
  const out: string[] = [
    'FLASHCARDS ORAL CDC / ATTACHÉ',
    "Version complète : question améliorée + réponse flashcard + réponse complète d'origine",
    `${n} flashcards numérotées en continu`,
    '',
  ]
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(3, '0')
    out.push(`CARTE ${num}`)
    out.push(`Question améliorée : Quelle est la priorité numéro ${i} pour un attaché ?`)
    out.push(`Réponse flashcard : La priorité numéro ${i} est de servir l'intérêt général dans le respect de la déontologie.`)
    out.push(`Réponse complète d'origine :`)
    out.push(`Réponse complète : Une réponse plus longue qui détaille la position attendue, avec contexte et nuances.`)
    out.push(`Posture à montrer : calme, méthode.`)
    out.push(`Méthode à mémoriser : analyser, agir, rendre compte.`)
    out.push(`Phrase de conclusion possible : "Au service du citoyen avant tout."`)
    out.push('')
  }
  return out.join('\n')
}

function makeFicheText(n: number): string {
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    out.push(`FICHE ${i}`)
    out.push(`Question: Définir la notion de souveraineté ${i}.`)
    out.push(`Réponse: La souveraineté est le pouvoir suprême...`)
    out.push('')
  }
  return out.join('\n')
}

function makeQAText(n: number): string {
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    out.push(`Card ${i}`)
    out.push(`Q: What is concept ${i}?`)
    out.push(`A: Concept ${i} is defined as the answer to question ${i}.`)
    out.push('')
  }
  return out.join('\n')
}

const cases = [
  { name: 'CARTE 001..244 (user real format)', text: makeCarteText(244), expected: 244 },
  { name: 'CARTE 001..50', text: makeCarteText(50), expected: 50 },
  { name: 'FICHE 1..30', text: makeFicheText(30), expected: 30 },
  { name: 'Card 1..12 (Q/A)', text: makeQAText(12), expected: 12 },
  // No structure → should return empty
  {
    name: 'No structure (random text)',
    text: 'This is a paragraph of random text.\nIt has no numbering.\nJust regular content.',
    expected: 0,
  },
]

let pass = 0
let fail = 0
for (const c of cases) {
  const cards = parseStructuredCards(c.text)
  const ok = cards.length === c.expected
  if (ok) pass++
  else fail++
  console.log(`${ok ? '✅' : '❌'} ${c.name}: expected=${c.expected} got=${cards.length}`)
  if (cards.length > 0 && c.expected > 0) {
    const first = cards[0]
    console.log(`     first card: prefix=${first.prefix} num=${first.original_number_raw}`)
    console.log(`       Q: ${first.question.slice(0, 80)}${first.question.length > 80 ? '…' : ''}`)
    console.log(`       A: ${first.answer.slice(0, 80)}${first.answer.length > 80 ? '…' : ''}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
