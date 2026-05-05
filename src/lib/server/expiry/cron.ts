import { sql } from 'drizzle-orm';
import { db } from '../db';
import { surveys, type Survey } from '../schema';
import { processExpired } from './process';
import { purgeExpiredSessions } from '../auth/sessions';
import { purgeExpiredVerificationTokens } from '../auth/verification';
import { log, withLogContext } from '../log';

const TICK_MS = 60_000;
const BATCH = 20;
// Recovery: добиваем survey, который застрял в 'expired' (процесс упал
// между atomic UPDATE active→expired и финальным sent/failed)
const STUCK_EXPIRED_THRESHOLD_MS = 5 * 60_000;
// Чистим протухшие сессии раз в час, чтобы таблица sessions не росла бесконечно.
const SESSION_PURGE_INTERVAL_MS = 60 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let scanning = false;
let lastSessionPurgeAt = 0;

/**
 * Атомарно "клеймит" пакет survey'ев под обработку:
 *  - active с истёкшим expires_at  → переводим в expired,
 *  - expired, застрявший дольше STUCK_EXPIRED_THRESHOLD_MS, → берём как есть.
 *
 * FOR UPDATE SKIP LOCKED исключает гонку с одновременным /finish или /retry
 * и гонку с другим инстансом cron (на будущее, для multi-process).
 * RETURNING * отдаёт нам строки, которые мы реально захватили.
 */
async function claimBatch(now: Date, stuckThreshold: Date): Promise<Survey[]> {
  // Передаём timestamps через ::timestamptz cast: postgres-js не умеет биндить
  // Date как timestamp без подсказки, передаём ISO-строку.
  const nowIso = now.toISOString();
  const stuckIso = stuckThreshold.toISOString();
  const rows = await db.execute<Survey>(sql`
    UPDATE ${surveys}
    SET status = 'expired'
    WHERE id IN (
      SELECT id FROM ${surveys}
      WHERE (status = 'active' AND expires_at < ${nowIso}::timestamptz)
         OR (status = 'expired' AND expires_at < ${stuckIso}::timestamptz)
      ORDER BY expires_at ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return Array.from(rows);
}

async function scan(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - STUCK_EXPIRED_THRESHOLD_MS);

    const claimed = await claimBatch(now, stuckThreshold);
    if (claimed.length > 0) {
      log.info('cron_claimed_surveys', { count: claimed.length });
      for (const s of claimed) {
        await withLogContext({ surveyCode: s.code, surveyId: s.id }, () => processExpired(s));
      }
    }

    if (now.getTime() - lastSessionPurgeAt > SESSION_PURGE_INTERVAL_MS) {
      lastSessionPurgeAt = now.getTime();
      try {
        const removed = await purgeExpiredSessions();
        if (removed > 0) log.info('cron_purged_sessions', { removed });
      } catch (err) {
        log.error('cron_session_purge_failed', {
          err: err instanceof Error ? err.message : String(err)
        });
      }
      try {
        const removed = await purgeExpiredVerificationTokens();
        if (removed > 0) log.info('cron_purged_verification_tokens', { removed });
      } catch (err) {
        log.error('cron_token_purge_failed', {
          err: err instanceof Error ? err.message : String(err)
        });
      }
    }
  } catch (err) {
    log.error('cron_scan_failed', { err: err instanceof Error ? err.message : String(err) });
  } finally {
    scanning = false;
  }
}

export function startExpiryCron(): void {
  if (timer) return;
  log.info('cron_started', { tickMs: TICK_MS });
  timer = setInterval(() => void scan(), TICK_MS);
  void scan();
}

export function stopExpiryCron(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
