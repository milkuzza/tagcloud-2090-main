import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { surveys, questions } from '../schema';
import { isValidCode } from '../surveys/codes';
import { addSubscriber, getRoom, removeSubscriber } from './broadcast';

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

  const [survey] = await db.select().from(surveys).where(eq(surveys.code, code)).limit(1);
  if (!survey || survey.creatorToken !== token) {
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
