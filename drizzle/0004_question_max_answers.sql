-- Per-question limit on number of words for answer_type='multi'.
-- Default 20 = previous hardcoded behavior in r/[code], so existing
-- questions are not affected.
ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "max_answers" integer NOT NULL DEFAULT 20;

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_max_answers_range"
  CHECK ("max_answers" BETWEEN 1 AND 50);
