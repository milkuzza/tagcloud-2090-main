---
name: testing-tagcloud
description: End-to-end testing of the tagcloud-2090 SvelteKit app. Use when verifying survey lifecycle (create→vote→view cloud→expire→email), WebSocket cloud streaming, multi-answer wizard, or comparing site vs email cloud layout.
---

# Testing tagcloud-2090 locally

## Stack

Three containers + dev server. Bring up infra and apply migrations:

```bash
cp .env.example .env  # if no .env yet
npm run db:up         # postgres + redis on 5432/6379
npm run db:migrate    # applies drizzle migrations 0000_baseline + 0001_cloud_settings
```

For email testing, run mailpit (the dev container is NOT in docker-compose):

```bash
docker run -d --name tagcloud-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit:latest
```

Then point `.env` at it:
```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=any
SMTP_PASSWORD=any
SMTP_FROM=results@local.dev
```
Web UI: http://localhost:8025 ; API: `GET /api/v1/messages`, `GET /api/v1/message/<ID>`, attachment by `partId` at `GET /api/v1/message/<ID>/part/<partId>`.

Dev server (use `--dns-result-order=ipv4first` if SMTP host has IPv6 AAAA records that aren't routable):
```bash
NODE_OPTIONS="--dns-result-order=ipv4first" npm run dev
```

## Auth shortcut

Verification email is sent via real SMTP. To skip clicking the link:
```bash
curl -s -X POST http://localhost:5173/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"test@local.dev","password":"Test12345!"}'

docker exec tagcloud-postgres psql -U tagcloud -d tagcloud \
  -c "UPDATE users SET email_verified=true, email_verified_at=now() WHERE email='test@local.dev';"
```
Then log in via `/login` UI.

## Survey min duration

`src/lib/server/surveys/validation.ts:60` enforces `expiresAt >= now() + 1 hour - 60s`. Set the picker to 1+ hour ahead in the UI, then force-expire in DB if you need to test cron:
```bash
docker exec tagcloud-postgres psql -U tagcloud -d tagcloud \
  -c "UPDATE surveys SET expires_at = now() - interval '5 minutes' WHERE code='XXXXXX';"
```
Cron tick is 60s (`TICK_MS` in `src/lib/server/expiry/cron.ts`). After force-expire, wait ≤60s for the next tick.

## Vote injection (no UI)

Votes are aggregated in two places:
1. `responses` table (Postgres) — used by CSV export and `processExpired`.
2. `cloud:${questionId}` ZSET (Redis) — used by the live cloud renderer on `/c/[code]`.

Submits go through `src/lib/server/voting/submit.ts` which writes both. Direct `INSERT` into `responses` will NOT update the live cloud — also do `ZINCRBY` on Redis:
```bash
docker exec tagcloud-redis redis-cli ZINCRBY cloud:<question_id> 5 пельмени
```
Get question ids: `SELECT id, position, text FROM questions WHERE survey_id=(SELECT id FROM surveys WHERE code='XXXXXX') ORDER BY position;`.

## Verifying the d3-cloud parity claim (site == email)

Both render paths share `src/lib/cloud-render.ts` (browser canvas via d3-cloud) and `workers/render-worker.mjs` (server canvas via d3-cloud). Both seed `mulberry32(0xc0de)`. Same input words/sizes → identical layout. To compare:

1. Open `/c/[code]` or `/s/[code]`, screenshot the canvas.
2. After cron sends results email, fetch the inline PNG from mailpit:
   ```bash
   curl -s 'http://localhost:8025/api/v1/messages' | jq -r '.messages[0].ID'
   curl -s 'http://localhost:8025/api/v1/message/<ID>' | jq '.Inline[]'
   curl -s 'http://localhost:8025/api/v1/message/<ID>/part/<partId>' -o /tmp/email_cloud.png
   ```
3. Compare side-by-side. Most popular word, vertical-rotated word, cluster shape — should all match.

## Verifying WS instead of polling on `/c/[code]`

Open DevTools → Network → WS filter. Expect:
- Single `ws://.../ws/c/<code>` connection, status `101 Switching Protocols`.
- Inbound `{"type":"snapshot","questionId":"...","words":[...]}` per question.
- Zero `GET /api/surveys/.../cloud` requests in Fetch/XHR (the endpoint was deleted in PR #6).

## Multi-answer wizard pass criteria

Q multi with `maxAnswers=N`: ONE input field, two buttons (`Ответить` + `Следующий вопрос`). After each `Ответить`: chip appears, input clears, counter `n / N` increments. On `n == N`: auto-advance to next question. Q single: same one input but only `Ответить` button. Final page: «Спасибо! Ваш ответ записан.» + button «Посмотреть облако».

## Known gotchas

### Outbound SMTP blocked on Devin VMs
TCP 25/465/587 to public hosts (Yandex, Gmail) typically times out from Devin's network. Use **mailpit** for any test that needs to read the email body or attachments. Real-delivery tests need user-side verification.

### `db.execute<T>(sql\`...RETURNING *\`)` returns snake_case
This was the root cause of a regression in PR #6 — `survey.maxWords` was undefined → `Math.max(100, undefined * 2) = NaN` → SQL `LIMIT $NaN`. Fix is to use drizzle's typed `db.update().set().where().returning()` so columns are mapped to camelCase. If you ever see `params: ...,NaN,...` in `expiry_failed` logs, this is the same class of bug — check for any other raw `db.execute<TableType>(sql\`RETURNING *\`)` calls.

### Drizzle migration generator can drift
If `npm run db:generate` creates a new baseline migration (e.g. `0000_*.sql`) when there shouldn't be one, the schema drifted from what's committed. Delete the generated file, run `docker compose down -v && npm run db:up && npm run db:migrate` to start clean from committed migrations.

### Status badge doesn't immediately flip from `expired` to `sent`
Cron tick is 60s, `/my` poll is 30s, so worst case is ~90s for the badge to update without manual refresh. WS broadcast on `/s/[code]` is instant.

## Devin Secrets Needed

- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — only if testing real email delivery (which is usually blocked from VMs anyway). For local, use mailpit (no creds).
- `SESSION_SECRET` — any 32+ char string for local. `.env.example` has a working default.
- `DATABASE_URL`, `REDIS_URL` — local containers, no creds needed.
