CREATE TYPE "public"."answer_type" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TYPE "public"."color_scheme" AS ENUM('mono', 'random', 'custom');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('active', 'expired', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"text" text NOT NULL,
	"answer_type" "answer_type" NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "responses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"word" text NOT NULL,
	"word_norm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"title" text,
	"creator_email" text NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"color_scheme" "color_scheme" DEFAULT 'mono' NOT NULL,
	"custom_palette" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "survey_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questions" ADD CONSTRAINT "questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_survey_idx" ON "questions" USING btree ("survey_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "responses_question_word_idx" ON "responses" USING btree ("question_id","word_norm");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "surveys_expires_status_idx" ON "surveys" USING btree ("status","expires_at");