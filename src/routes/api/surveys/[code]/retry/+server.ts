import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
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

  // Можно retry только если опрос завершён неудачно или застрял в обработке
  const [claimed] = await db
    .update(surveys)
    .set({ status: 'expired' })
    .where(and(eq(surveys.id, survey.id), inArray(surveys.status, ['failed', 'expired'])))
    .returning();

  if (!claimed) {
    return json(
      {
        error: {
          code: 'cannot_retry',
          message: `Нельзя retry для статуса ${survey.status}`,
          status: survey.status
        }
      },
      { status: 409 }
    );
  }

  await processExpired(claimed);

  const [final] = await db
    .select({ status: surveys.status })
    .from(surveys)
    .where(eq(surveys.id, survey.id))
    .limit(1);

  return json({ ok: true, status: final.status });
};
