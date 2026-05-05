-- S-3: email-верификация при регистрации.
--
-- Добавляем флаг подтверждения email на users и таблицу токенов верификации.
-- Существующие пользователи с уже установленным паролем считаются подтверждёнными
-- (grandfather), чтобы не блокировать их вход после деплоя миграции.
-- "Призрачные" users из 0002 backfill (password_hash IS NULL) остаются
-- email_verified=false — claim сработает только после регистрации + клика по
-- ссылке из письма, что и закрывает дыру с захватом чужих опросов.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;--> statement-breakpoint

-- Grandfather: уже зарегистрированные (password_hash NOT NULL) считаются подтверждёнными.
UPDATE "users" SET "email_verified" = true, "email_verified_at" = NOW()
WHERE "password_hash" IS NOT NULL AND "email_verified" = false;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "email" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "evt_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "evt_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evt_expires_idx" ON "email_verification_tokens" USING btree ("expires_at");
