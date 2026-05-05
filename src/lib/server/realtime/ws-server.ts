import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { surveys, questions } from '../schema';
import { isValidCode } from '../surveys/codes';
import { addSubscriber, getRoom, removeSubscriber } from './broadcast';
import { checkWsRateLimit } from '../voting/rate-limit';
import { log } from '../log';

const wss = new WebSocketServer({ noServer: true });

wss.on(
  'connection',
  async (ws: WebSocket, _req: IncomingMessage, ctx: { code: string; questionIds: string[] }) => {
    const room = getRoom(ctx.code, ctx.questionIds);
    await addSubscriber(room, ws);

    ws.on('close', () => removeSubscriber(room, ws));
    ws.on('error', () => removeSubscriber(room, ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        /* ignore */
      }
    });
  }
);

/**
 * Постоянное по времени сравнение строк одинаковой длины (см.
 * `auth/access.ts` — те же требования к creatorToken).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Достаёт client IP из заголовков proxy либо из сокета. На WS-handshake
 * SvelteKit не делает обёрток над request — берём X-Forwarded-For сами,
 * как Caddy его проставляет (см. deploy/Caddyfile, XFF_DEPTH=1).
 */
function getClientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const header = Array.isArray(xff) ? xff[0] : xff;
  if (header) {
    const first = header.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export async function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = url.pathname.match(/^\/ws\/([A-Z0-9]+)$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const code = match[1];
  if (!isValidCode(code)) {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get('t');
  if (!token) {
    socket.destroy();
    return;
  }

  // Rate-limit ДО запроса к Postgres: дешевый INCR в Redis, защищает БД
  // от шторма handshake'ов при попытке перебрать creatorToken.
  const ip = getClientIp(req);
  const rl = await checkWsRateLimit(ip);
  if (!rl.allowed) {
    log.warn('ws_rate_limited', { surveyCode: code, retryAfterSec: rl.retryAfterSec });
    socket.write(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${rl.retryAfterSec}\r\n\r\n`);
    socket.destroy();
    return;
  }

  const [survey] = await db.select().from(surveys).where(eq(surveys.code, code)).limit(1);
  if (!survey || !constantTimeEqual(survey.creatorToken, token)) {
    socket.destroy();
    return;
  }

  // Не открываем WS для уже завершённых опросов: клиенту сразу шлём
  // 'closed' через короткоживущий апгрейд, чтобы UI обновил состояние.
  if (survey.status !== 'active') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        ws.send(JSON.stringify({ type: 'closed', reason: survey.status }));
      } finally {
        ws.close(1000, survey.status);
      }
    });
    return;
  }

  const qs = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .orderBy(questions.position);

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, { code, questionIds: qs.map((q) => q.id) });
  });
}
