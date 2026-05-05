import { error } from '@sveltejs/kit';
import { isValidCode } from '$lib/server/surveys/codes';
import { getSurveyPublic } from '$lib/server/surveys/get';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const code = params.code;
  if (!isValidCode(code)) error(404, 'Опрос не найден');

  const survey = await getSurveyPublic(code);
  if (!survey) error(404, 'Опрос не найден');

  const expired = survey.status !== 'active' || new Date(survey.expiresAt).getTime() < Date.now();
  return { survey, expired };
};
