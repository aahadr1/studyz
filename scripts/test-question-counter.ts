/**
 * Quick integration test for `countQuestions` against the user's real format.
 *
 * Run with:
 *   npx tsx scripts/test-question-counter.ts
 */
import { countQuestions } from '../lib/question-counter'

function makeCarteText(n: number): string {
  const out: string[] = [
    'FLASHCARDS ORAL CDC / ATTACHÉ',
    'Version complète : question améliorée + réponse flashcard + réponse complète d\'origine',
    `${n} flashcards numérotées en continu`,
    '',
  ]
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(3, '0')
    out.push(`CARTE ${num}`)
    out.push(`Question améliorée : Question fictive numéro ${i} pour tester le compteur ?`)
    out.push(`Réponse flashcard : Réponse synthétique numéro ${i}.`)
    out.push(`Réponse complète d'origine :`)
    out.push(`Réponse complète : Réponse plus longue qui détaille la position.`)
    out.push('')
  }
  return out.join('\n')
}

const cases = [
  { name: 'CARTE 001..244', text: makeCarteText(244), expected: 244 },
  { name: 'CARTE 001..50', text: makeCarteText(50), expected: 50 },
  { name: 'CARTE 001..7', text: makeCarteText(7), expected: 7 },
  {
    name: 'Mixed FICHE',
    text: Array.from({ length: 30 }, (_, i) => `FICHE ${i + 1}\nDu contenu ici.`).join('\n\n'),
    expected: 30,
  },
  {
    name: 'Card 1..12',
    text: Array.from({ length: 12 }, (_, i) => `Card ${i + 1}\nContent.`).join('\n\n'),
    expected: 12,
  },
]

let pass = 0
let fail = 0
for (const c of cases) {
  const result = countQuestions(c.text)
  const ok = result.count === c.expected
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? '✅' : '❌'} ${c.name}: expected=${c.expected} got=${result.count} source=${result.source}`
  )
  if (!ok) {
    console.log('   strategies:')
    for (const s of result.strategies) {
      console.log(
        `     - ${s.name}: count=${s.count} conf=${s.confidence.toFixed(2)} ${JSON.stringify(s.details)}`
      )
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
