import { json } from '@sveltejs/kit';

export async function GET() {
  const [db, redis] = await Promise.all([
    import('$lib/server/db').then((m) => m.pingDb()).catch(() => false),
    import('$lib/server/redis').then((m) => m.pingRedis()).catch(() => false)
  ]);
  const ok = db && redis;
  return json({ ok, db, redis }, { status: ok ? 200 : 503 });
}
