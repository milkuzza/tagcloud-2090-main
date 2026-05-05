import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { surveys, questions, responses } from '../schema';

export type QuestionPublic = {
  id: string;
  text: string;
  answerType: 'single' | 'multi';
  maxAnswers: number;
  position: number;
};

export type SurveyPublic = {
  code: string;
  title: string | null;
  expiresAt: Date;
  status: 'active' | 'expired' | 'sent' | 'failed';
  questions: QuestionPublic[];
};

export type SurveyForCreator = SurveyPublic & {
  id: string;
  creatorEmail: string;
  creatorToken: string;
  caseSensitive: boolean;
  colorScheme: 'mono' | 'random' | 'custom';
  customPalette: string[] | null;
  createdAt: Date;
};

async function loadQuestions(surveyId: string): Promise<QuestionPublic[]> {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.surveyId, surveyId))
    .orderBy(questions.position);
  return rows.map((q) => ({
    id: q.id,
    text: q.text,
    answerType: q.answerType,
    maxAnswers: q.maxAnswers,
    position: q.position
  }));
}

export async function getSurveyPublic(code: string): Promise<SurveyPublic | null> {
  const [survey] = await db.select().from(surveys).where(eq(surveys.code, code)).limit(1);
  if (!survey) return null;

  return {
    code: survey.code,
    title: survey.title,
    expiresAt: survey.expiresAt,
    status: survey.status,
    questions: await loadQuestions(survey.id)
  };
}

export async function getSurveyForCreator(
  code: string,
  opts: { userId?: string; token?: string }
): Promise<SurveyForCreator | null> {
  const [survey] = await db.select().from(surveys).where(eq(surveys.code, code)).limit(1);
  if (!survey) return null;

  // Доступ: либо session (userId матчит surveys.user_id), либо старый ?t=token
  const ok =
    (opts.userId !== undefined && survey.userId === opts.userId) ||
    (opts.token !== undefined && survey.creatorToken === opts.token);
  if (!ok) return null;

  return {
    id: survey.id,
    code: survey.code,
    title: survey.title,
    expiresAt: survey.expiresAt,
    status: survey.status,
    creatorEmail: survey.creatorEmail,
    creatorToken: survey.creatorToken,
    caseSensitive: survey.caseSensitive,
    colorScheme: survey.colorScheme,
    customPalette: survey.customPalette,
    createdAt: survey.createdAt,
    questions: await loadQuestions(survey.id)
  };
}

export type UserSurveyListItem = {
  code: string;
  title: string | null;
  status: 'active' | 'expired' | 'sent' | 'failed';
  expiresAt: Date;
  createdAt: Date;
  questionsCount: number;
  responsesCount: number;
};

export async function listUserSurveys(userId: string): Promise<UserSurveyListItem[]> {
  const rows = await db
    .select()
    .from(surveys)
    .where(eq(surveys.userId, userId))
    .orderBy(desc(surveys.createdAt));
  if (rows.length === 0) return [];

  const surveyIds = rows.map((s) => s.id);

  const qCounts = await db
    .select({ surveyId: questions.surveyId, cnt: sql<number>`count(*)::int` })
    .from(questions)
    .where(inArray(questions.surveyId, surveyIds))
    .groupBy(questions.surveyId);
  const qBy = new Map(qCounts.map((r) => [r.surveyId, r.cnt]));

  const rCounts = await db
    .select({
      surveyId: questions.surveyId,
      cnt: sql<number>`count(${responses.id})::int`
    })
    .from(questions)
    .leftJoin(responses, eq(questions.id, responses.questionId))
    .where(inArray(questions.surveyId, surveyIds))
    .groupBy(questions.surveyId);
  const rBy = new Map(rCounts.map((r) => [r.surveyId, r.cnt]));

  return rows.map((s) => ({
    code: s.code,
    title: s.title,
    status: s.status,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    questionsCount: qBy.get(s.id) ?? 0,
    responsesCount: rBy.get(s.id) ?? 0
  }));
}
