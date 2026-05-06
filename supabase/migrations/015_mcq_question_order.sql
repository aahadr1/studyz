-- Ensure MCQ questions keep the exact original document order.
-- We store an explicit index per page and always sort by (page_number, page_question_index).

ALTER TABLE mcq_questions
ADD COLUMN IF NOT EXISTS page_question_index INTEGER;

-- Backfill deterministically for existing rows (best effort):
-- order within a page by UUID so ordering becomes stable (even if it wasn't before).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY mcq_set_id, page_number
      ORDER BY id
    ) - 1 AS idx
  FROM mcq_questions
  WHERE page_question_index IS NULL
)
UPDATE mcq_questions q
SET page_question_index = ranked.idx
FROM ranked
WHERE q.id = ranked.id;

ALTER TABLE mcq_questions
ALTER COLUMN page_question_index SET DEFAULT 0;

ALTER TABLE mcq_questions
ALTER COLUMN page_question_index SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mcq_questions_set_page_order
  ON mcq_questions (mcq_set_id, page_number, page_question_index);

