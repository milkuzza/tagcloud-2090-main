// Smoke-тест WS: создаёт опрос, подписывается через WS,
// отправляет голос и ждёт snapshot с этим словом.
import WebSocket from 'ws';

const BASE = 'http://localhost:5173';

async function main() {
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const created = await fetch(`${BASE}/api/surveys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      creatorEmail: 'ws@test.local',
      caseSensitive: false,
      colorScheme: 'mono',
      expiresAt,
      questions: [{ text: 'WS smoke', answerType: 'single' }]
    })
  }).then((r) => r.json());

  const { code, creatorToken } = created;
  const pub = await fetch(`${BASE}/api/surveys/${code}/public`).then((r) => r.json());
  const qid = pub.questions[0].id;
  console.log(`survey=${code} qid=${qid.slice(0, 8)}…`);

  const ws = new WebSocket(`ws://localhost:5173/ws/${code}?t=${creatorToken}`);

  const got = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout 8s')), 8000);
    let sawInitialSnapshot = false;
    ws.on('open', async () => {
      console.log('ws open');
    });
    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      console.log('msg:', JSON.stringify(msg));
      if (msg.type === 'snapshot' && msg.questionId === qid) {
        if (!sawInitialSnapshot) {
          sawInitialSnapshot = true;
          // отправляем голос после первого snapshot (initial)
          const t0 = Date.now();
          const r = await fetch(`${BASE}/api/surveys/${code}/answer`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              answers: [{ questionId: qid, words: ['тест'] }]
            })
          });
          console.log(`vote sent in ${Date.now() - t0}ms HTTP ${r.status}`);
          if (r.status !== 201) {
            const body = await r.text();
            reject(new Error(`vote failed: ${r.status} ${body}`));
          }
          return;
        }
        // последующий snapshot — ждём слово 'тест'
        if (msg.words.some((w) => w[0] === 'тест')) {
          clearTimeout(timeout);
          resolve(msg);
        }
      }
    });
    ws.on('error', reject);
  });

  const t0 = Date.now();
  const result = await got;
  console.log(`✓ слово появилось в облаке за ${Date.now() - t0}мс`);
  console.log('top:', result.words);
  ws.close();
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
