import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { surveys } from '$lib/server/schema';
import { processExpired } from '$lib/server/expiry/process';
import { requireCreatorAccess } from '$lib/server/auth/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, url, locals }) => {
  const access = await requireCreatorAccess({
    code: params.code!,
    userId: locals.user?.id,
    token: url.searchParams.get('t')
  });
  if (!access.ok) {
    return json(
      { error: { code: access.code, message: access.message } },
      { status: access.status }
    );
  }
  const survey = access.survey;

  // Атомарный переход active → expired. Если кто-то уже забрал — 409.
  const [claimed] = await db
    .update(surveys)
    .set({ status: 'expired', expiresAt: new Date() })
    .where(and(eq(surveys.id, survey.id), eq(surveys.status, 'active')))
    .returning();

  if (!claimed) {
    return json(
      {
        error: {
          code: 'already_finished',
          message: 'Опрос уже завершён',
          status: survey.status
        }
      },
      { status: 409 }
    );
  }

  // Синхронно обрабатываем: aggregate → PNG → CSV → sendMail.
  // processExpired выставит status='sent' или 'failed' и broadcast notifyClosed.
  await processExpired(claimed);

  const [final] = await db
    .select({ status: surveys.status })
    .from(surveys)
    .where(eq(surveys.id, survey.id))
    .limit(1);

  return json({ ok: true, status: final.status });
};
