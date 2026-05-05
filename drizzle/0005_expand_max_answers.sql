-- Expand the per-question max_answers ceiling from 50 to 200.
-- The default of 20 stays unchanged: existing questions/old clients keep
-- working as before (they simply could already pass anything in 1..50 and
-- now anything in 1..200).
ALTER TABLE "questions"
  DROP CONSTRAINT IF EXISTS "questions_max_answers_range";

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_max_answers_range"
  CHECK ("max_answers" BETWEEN 1 AND 200);
