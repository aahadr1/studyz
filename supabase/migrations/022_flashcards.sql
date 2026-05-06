-- ============================================================
-- Flashcard Feature: decks, cards, spaced-repetition reviews
-- ============================================================

-- Decks
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  source_pdf_name TEXT,

  -- Denormalised counters (updated on insert/delete of cards / reviews)
  total_cards INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,   -- never reviewed
  due_count INTEGER NOT NULL DEFAULT 0,   -- overdue or due today

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_id ON flashcard_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_created_at ON flashcard_decks(created_at DESC);

-- Cards
CREATE TABLE IF NOT EXISTS flashcard_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content (Markdown + KaTeX supported)
  card_type TEXT NOT NULL DEFAULT 'basic' CHECK (card_type IN ('basic', 'cloze', 'definition')),
  front TEXT NOT NULL,
  back TEXT NOT NULL,

  -- Optional metadata
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_page INTEGER,
  hint TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_cards_deck_id ON flashcard_cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_cards_user_id ON flashcard_cards(user_id);

-- SM-2 review state (one row per card per user)
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- SM-2 fields
  interval INTEGER NOT NULL DEFAULT 0,          -- days until next review
  ease_factor FLOAT NOT NULL DEFAULT 2.5,        -- EF, min 1.3
  repetitions INTEGER NOT NULL DEFAULT 0,        -- successful reviews in a row
  due_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- when to show next
  last_quality INTEGER,                          -- 0-5 last rating

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_id ON flashcard_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card_id ON flashcard_reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_due_date ON flashcard_reviews(due_date);

-- ── RLS ────────────────────────────────────────────────────

ALTER TABLE flashcard_decks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_cards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

-- Decks
CREATE POLICY "Users can view their own flashcard decks"
  ON flashcard_decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own flashcard decks"
  ON flashcard_decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flashcard decks"
  ON flashcard_decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flashcard decks"
  ON flashcard_decks FOR DELETE USING (auth.uid() = user_id);

-- Cards
CREATE POLICY "Users can view their own flashcard cards"
  ON flashcard_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own flashcard cards"
  ON flashcard_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flashcard cards"
  ON flashcard_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flashcard cards"
  ON flashcard_cards FOR DELETE USING (auth.uid() = user_id);

-- Reviews
CREATE POLICY "Users can view their own flashcard reviews"
  ON flashcard_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own flashcard reviews"
  ON flashcard_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own flashcard reviews"
  ON flashcard_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own flashcard reviews"
  ON flashcard_reviews FOR DELETE USING (auth.uid() = user_id);

-- ── Triggers ───────────────────────────────────────────────

-- Reuse or create update_updated_at_column() (safe if already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_flashcard_decks_updated_at ON flashcard_decks;
CREATE TRIGGER update_flashcard_decks_updated_at
  BEFORE UPDATE ON flashcard_decks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_flashcard_cards_updated_at ON flashcard_cards;
CREATE TRIGGER update_flashcard_cards_updated_at
  BEFORE UPDATE ON flashcard_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_flashcard_reviews_updated_at ON flashcard_reviews;
CREATE TRIGGER update_flashcard_reviews_updated_at
  BEFORE UPDATE ON flashcard_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Comments ───────────────────────────────────────────────
COMMENT ON TABLE flashcard_decks   IS 'Collections of flashcards created by users';
COMMENT ON TABLE flashcard_cards   IS 'Individual flashcards with Markdown+KaTeX content';
COMMENT ON TABLE flashcard_reviews IS 'SM-2 spaced repetition state per card per user';
