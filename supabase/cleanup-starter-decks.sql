-- Delete all CDC starter deck versions (v1..v4) for every user.
-- After running this, the app will re-seed fresh decks on next visit
-- using the Node.js seeder (correct UTF-8, no clipboard encoding risk).
-- For a one-shot full backfill (delete + insert), prefer
-- supabase/seed-cdc-starter-deck-v4.sql instead.

DELETE FROM public.flashcard_cards
  WHERE deck_id IN (
    SELECT id FROM public.flashcard_decks
    WHERE source_pdf_name LIKE '__starter:cdc-attache-v%'
  );

DELETE FROM public.flashcard_decks
  WHERE source_pdf_name LIKE '__starter:cdc-attache-v%';
