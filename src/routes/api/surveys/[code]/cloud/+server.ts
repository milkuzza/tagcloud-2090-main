import { error, json } from '@sveltejs/kit';
import { isValidCode } from '$lib/server/surveys/codes';
import { getSurveyPublic } from '$lib/server/surveys/get';
import { aggregateQuestion } from '$lib/server/cloud/aggregate';
import type { CloudWord } from '$lib/types/cloud';
import type { RequestHandler } from './$types';

/**
 * Публичный endpoint топ-слов по коду опроса. Используется страницей
 * `/c/[code]` для периодической дозагрузки, чтобы у респондентов
 * показывалось «живое» облако без открытия дашборда (творческого
 * доступа). WS не используем, чтобы не выдавать creatorToken.
 *
 * Возвращает `{ words: { [questionId]: [string, number][] } }`.
 */
export const GET: RequestHandler = async ({ params }) => {
  const code = params.code!;
  if (!isValidCode(code)) error(404, 'Опрос не найден');

  const survey = await getSurveyPublic(code);
  if (!survey) error(404, 'Опрос не найден');

  const entries = await Promise.all(
    survey.questions.map(async (q) => [q.id, await aggregateQuestion(q.id, 200)] as const)
  );
  const words: Record<string, CloudWord[]> = Object.fromEntries(entries);

  return json(
    { words, status: survey.status },
    {
      // Позволяем CDN/прокси кэшировать на 1с, чтобы шторм опросов не
      // прибил Postgres: респонденты обычно перезагружают страницу
      // примерно одновременно, и общий ответ переиспользуется.
      headers: { 'Cache-Control': 'public, max-age=1' }
    }
  );
};
