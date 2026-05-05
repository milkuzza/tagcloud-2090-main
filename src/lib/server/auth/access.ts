import { eq } from 'drizzle-orm';
import { db } from '../db';
import { surveys, type Survey } from '../schema';
import { isValidCode } from '../surveys/codes';

export type AccessFailure =
  | { ok: false; status: 400; code: 'invalid_code'; message: string }
  | { ok: false; status: 401; code: 'unauthorized'; message: string }
  | { ok: false; status: 403; code: 'forbidden'; message: string }
  | { ok: false; status: 404; code: 'survey_not_found'; message: string };

export type AccessSuccess = { ok: true; survey: Survey };

export type AccessResult = AccessSuccess | AccessFailure;

export type AccessOpts = {
  code: string;
  userId?: string;
  token?: string | null;
};

/**
 * Проверяет, что вызывающий имеет доступ к опросу как создатель:
 *  - либо он залогинен и опрос принадлежит его user_id (новый путь),
 *  - либо он передал верный creator_token в `?t=` (legacy/публичный путь).
 *
 * Возвращает либо `{ ok: true, survey }`, либо описание ошибки с уже
 * подобранным HTTP-статусом — единый формат для JSON-эндпоинтов.
 */
export async function requireCreatorAccess(opts: AccessOpts): Promise<AccessResult> {
  if (!isValidCode(opts.code)) {
    return { ok: false, status: 400, code: 'invalid_code', message: 'Некорректный код' };
  }
  if (!opts.userId && !opts.token) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Нужен вход или токен' };
  }

  const [survey] = await db.select().from(surveys).where(eq(surveys.code, opts.code)).limit(1);
  if (!survey) {
    return { ok: false, status: 404, code: 'survey_not_found', message: 'Опрос не найден' };
  }

  const allowed =
    (opts.userId !== undefined && survey.userId === opts.userId) ||
    (opts.token !== undefined && opts.token !== null && survey.creatorToken === opts.token);
  if (!allowed) {
    return { ok: false, status: 403, code: 'forbidden', message: 'Нет доступа' };
  }

  return { ok: true, survey };
}
