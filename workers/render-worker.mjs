// Воркер для piscina. Гоняется в отдельном Node-потоке — d3-cloud layout
// и canvas-рендер больше не блокируют главный event loop (актуально под
// 1000+ concurrent: один блокирующий syncwrap в main-loop'е роняет latency
// для всех клиентов на 200–500мс).
//
// ВАЖНО: файл — обычный ESM (.mjs), НЕ .ts и НЕ внутри src/. Vite не
// бандлит этот файл, так что путь резолвится одинаково в dev и в prod
// (`<project_root>/workers/render-worker.mjs`).
//
// Зависимости (canvas, d3-cloud) — те же, что и main thread, но
// инициализируются в воркере отдельно.

import { createCanvas } from 'canvas';
import cloud from 'd3-cloud';

const FONT = 'sans-serif';
const BRAND_NAVY = '#0F172A';

// Дублируем helper'ы из src/lib/cloud.ts — воркер обязан быть автономным,
// иначе придётся тащить всё дерево SvelteKit'овских импортов в worker thread.
// Список достаточно стабилен (схемы цветов фиксированы), смены редки.
function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => {
    const c = lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomReadableColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 65 + Math.floor(Math.random() * 20);
  const l = 30 + Math.floor(Math.random() * 20);
  return hslToHex(h, s, l);
}

function colorPicker(scheme, palette) {
  if (scheme === 'mono') return () => BRAND_NAVY;
  if (scheme === 'random') return randomReadableColor;
  if (scheme === 'custom' && palette && palette.length > 0) {
    return () => palette[Math.floor(Math.random() * palette.length)];
  }
  return () => BRAND_NAVY;
}

function weightFactor(words, baseSize) {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count) => baseSize * (1 + (Math.log2(count + 1) / denom) * 3);
}

function drawEmpty(width, height, message) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#6B7280';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
  return canvas.toBuffer('image/png');
}

export default async function render(job) {
  const { words, scheme, palette, width, height } = job;
  if (!Array.isArray(words) || words.length === 0) {
    return drawEmpty(width, height, 'Нет ответов');
  }

  const wf = weightFactor(words, 28);
  const color = colorPicker(scheme, palette);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  await new Promise((resolve, reject) => {
    const layout = cloud()
      .size([width, height])
      .canvas(() => createCanvas(1, 1))
      .words(words.map(([text, count]) => ({ text, size: wf(count) })))
      .padding(4)
      .rotate(() => 0)
      .font(FONT)
      .fontSize((d) => d.size)
      .on('end', (placed) => {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const w of placed) {
          ctx.font = `${w.size}px ${FONT}`;
          ctx.fillStyle = color();
          ctx.save();
          ctx.translate(w.x ?? 0, w.y ?? 0);
          ctx.rotate(((w.rotate ?? 0) * Math.PI) / 180);
          ctx.fillText(w.text ?? '', 0, 0);
          ctx.restore();
        }
        ctx.restore();
        resolve();
      });
    try {
      layout.start();
    } catch (e) {
      reject(e);
    }
  });

  return canvas.toBuffer('image/png');
}
