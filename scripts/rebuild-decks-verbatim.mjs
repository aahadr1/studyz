/**
 * Rebuild all 12 starter-deck stack JSON files verbatim from the source text.
 * Run: node scripts/rebuild-decks-verbatim.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = readFileSync(join(root, 'data', 'starter-deck-cdc-source-v2.txt'), 'utf8');

const STACKS = [
  { number: 1,  title: "Mises en situation managériales du quotidien",                                                          file: 'stack-01.json', range: [1, 10]   },
  { number: 2,  title: "Posture personnelle, qualités managériales et rapport au travail",                                      file: 'stack-02.json', range: [11, 38]  },
  { number: 3,  title: "Questions d'opinion, société, actualité et argumentation",                                              file: 'stack-03.json', range: [39, 74]  },
  { number: 4,  title: "Mises en situation complexes et prise de poste",                                                        file: 'stack-04.json', range: [75, 85]  },
  { number: 5,  title: "Parcours, RHP et compétences comportementales",                                                         file: 'stack-05.json', range: [86, 95]  },
  { number: 6,  title: "Connaissances administratives générales et institutions",                                                file: 'stack-06.json', range: [96, 106] },
  { number: 7,  title: "Groupe Caisse des Dépôts, Banque des Territoires, métiers, gouvernance et histoire",                   file: 'stack-07.json', range: [107, 134]},
  { number: 8,  title: "Statut, fonction publique, obligations, dialogue social et RH",                                         file: 'stack-08.json', range: [135, 165]},
  { number: 9,  title: "Actualité gouvernementale, transition écologique, industrie, numérique et souveraineté",               file: 'stack-09.json', range: [166, 193]},
  { number: 10, title: "Élections, collectivités, finances locales, Grand Est et politiques territoriales",                    file: 'stack-10.json', range: [194, 209]},
  { number: 11, title: "Déontologie, aides publiques, intérêt général et sécurité juridique",                                  file: 'stack-11.json', range: [210, 221]},
  { number: 12, title: "Réorganisation CD54, motivation personnelle, lignes de défense et phrases pivots",                     file: 'stack-12.json', range: [222, 244]},
];

// Split source into card blocks by the "CARTE NNN" marker.
// We use a regex that captures the card number and everything until the next marker.
const parts = src.split(/^ CARTE (\d{3})\s*$/m);
// parts[0] = preamble before first CARTE
// parts[1] = "001", parts[2] = body of card 001
// parts[3] = "002", parts[4] = body of card 002, etc.

const cards = new Map();

for (let i = 1; i < parts.length; i += 2) {
  const num = parseInt(parts[i], 10);
  const body = (parts[i + 1] || '').trim();

  // Extract Question and Réponse. The labels can be "Question :" or "Question:".
  // Question text runs until "Réponse :", then Réponse runs to end.
  const qMatch = body.match(/^Question\s*:\s*([\s\S]*?)(?=\nRéponse\s*:)/);
  const aMatch = body.match(/\nRéponse\s*:\s*([\s\S]*)$/);

  if (!qMatch || !aMatch) {
    console.warn(`[WARN] Could not parse card ${num}. Body:\n${body.slice(0, 200)}`);
    continue;
  }

  cards.set(num, {
    n: num,
    front: qMatch[1].trim(),
    back: aMatch[1].trim(),
  });
}

console.log(`Parsed ${cards.size} cards from source.`);
if (cards.size !== 244) {
  console.error(`Expected 244 cards, got ${cards.size}. Check source file.`);
}

// Write stack JSON files
const deckDir = join(root, 'data', 'starter-deck');

for (const stack of STACKS) {
  const [min, max] = stack.range;
  const stackCards = [];
  for (let i = min; i <= max; i++) {
    const c = cards.get(i);
    if (c) {
      stackCards.push(c);
    } else {
      console.warn(`[WARN] Missing card ${i} for stack ${stack.number}`);
    }
  }

  const out = { stack_number: stack.number, cards: stackCards };
  writeFileSync(join(deckDir, stack.file), JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Stack ${stack.number}: ${stackCards.length} cards → ${stack.file}`);
}

// Update manifest
const manifest = {
  deck_name: "Flashcards Oral CDC / Attaché",
  deck_description: "244 flashcards classées en 12 stacks pour préparer l'oral CDC / Attaché.",
  language: "fr",
  version: "2.0.0",
  total_cards: 244,
  stacks: STACKS.map(s => ({
    number: s.number,
    title: s.title,
    card_range: `${String(s.range[0]).padStart(3, '0')}-${String(s.range[1]).padStart(3, '0')}`,
    card_count: s.range[1] - s.range[0] + 1,
    file: s.file,
  })),
};
writeFileSync(join(deckDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('manifest.json updated (version 2.0.0)');
