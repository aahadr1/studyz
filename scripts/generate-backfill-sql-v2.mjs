/**
 * Generate supabase/seed-cdc-starter-deck-v2.sql
 * This script replaces v1 (and any stale v2) decks for every user with
 * the freshly parsed verbatim v2 content.
 *
 * Run:  node scripts/generate-backfill-sql-v2.mjs > supabase/seed-cdc-starter-deck-v2.sql
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const deckDir = join(root, 'data', 'starter-deck');

const V2_MARKER_PREFIX = '__starter:cdc-attache-v2__';
const OLD_MARKER_PATTERN = '__starter:cdc-attache-v%';

function esc(str) {
  return str.replace(/'/g, "''");
}

const manifest = JSON.parse(readFileSync(join(deckDir, 'manifest.json'), 'utf8'));

const stacks = manifest.stacks.map(meta => {
  const data = JSON.parse(readFileSync(join(deckDir, meta.file), 'utf8'));
  return { meta, cards: data.cards };
});

const totalCards = stacks.reduce((s, st) => s + st.cards.length, 0);

const lines = [];

lines.push(`-- ============================================================`);
lines.push(`-- Backfill v2: CDC / Attaché starter deck (${totalCards} cards, ${stacks.length} stacks)`);
lines.push(`-- Run in the Supabase SQL Editor.`);
lines.push(`-- For each user: deletes any v1 or v2 starter decks, then inserts fresh v2.`);
lines.push(`-- ============================================================`);
lines.push(``);
lines.push(`DO $$`);
lines.push(`DECLARE`);
lines.push(`  target_user_id UUID;`);
lines.push(`  v_deck_id UUID;`);
lines.push(`  v_done INT := 0;`);
lines.push(`BEGIN`);
lines.push(`  FOR target_user_id IN SELECT id FROM auth.users LOOP`);
lines.push(``);
lines.push(`    -- Delete all previous starter deck versions for this user`);
lines.push(`    DELETE FROM public.flashcard_cards`);
lines.push(`      WHERE deck_id IN (`);
lines.push(`        SELECT id FROM public.flashcard_decks`);
lines.push(`        WHERE user_id = target_user_id`);
lines.push(`          AND source_pdf_name LIKE '${OLD_MARKER_PATTERN}%'`);
lines.push(`      );`);
lines.push(`    DELETE FROM public.flashcard_decks`);
lines.push(`      WHERE user_id = target_user_id`);
lines.push(`        AND source_pdf_name LIKE '${OLD_MARKER_PATTERN}%';`);
lines.push(``);

for (const { meta, cards } of stacks) {
  const stackNum = String(meta.number).padStart(2, '0');
  const deckName = `CDC ${stackNum}. ${meta.title}`;
  const deckDesc = meta.title;
  const marker = `${V2_MARKER_PREFIX}:stack-${stackNum}`;

  lines.push(`    -- Stack ${meta.number}: ${meta.title}`);
  lines.push(`    INSERT INTO public.flashcard_decks`);
  lines.push(`      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)`);
  lines.push(`    VALUES (`);
  lines.push(`      target_user_id,`);
  lines.push(`      '${esc(deckName)}',`);
  lines.push(`      '${esc(deckDesc)}',`);
  lines.push(`      '${esc(marker)}',`);
  lines.push(`      ${cards.length},`);
  lines.push(`      ${cards.length},`);
  lines.push(`      0`);
  lines.push(`    ) RETURNING id INTO v_deck_id;`);
  lines.push(``);

  for (const card of cards) {
    lines.push(`    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (`);
    lines.push(`      v_deck_id,`);
    lines.push(`      target_user_id,`);
    lines.push(`      'basic',`);
    lines.push(`      '${esc(card.front)}',`);
    lines.push(`      '${esc(card.back)}'`);
    lines.push(`    );`);
  }
  lines.push(``);
}

lines.push(`    v_done := v_done + 1;`);
lines.push(`  END LOOP;`);
lines.push(`  RAISE NOTICE 'Done: % users updated', v_done;`);
lines.push(`END $$;`);

process.stdout.write(lines.join('\n') + '\n');
