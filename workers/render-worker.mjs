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
const BRAND_NAVY = '#0E2A5C';

// Дублируем helper'ы из src/lib/cloud.ts — воркер обязан быть автономным,
// иначе придётся тащить всё дерево SvelteKit'овских импортов в worker thread.
// Поведение строго совпадает с клиентом: одинаковая раскраска и
// размер/толщина шрифта, чтобы письмо и сайт показывали одно и то же облако.
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

function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function deterministicReadableColor(word) {
  const h = strHash(word) % 360;
  return hslToHex(h, 72, 38);
}

function hexToRgb(hex) {
  const v = hex.replace(/^#/, '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function interpolateStops(stops, t) {
  if (stops.length === 0) return BRAND_NAVY;
  if (stops.length === 1) return stops[0];
  const tt = Math.max(0, Math.min(1, t));
  const seg = (stops.length - 1) * tt;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const local = seg - i;
  return lerpHex(stops[i], stops[i + 1], local);
}

function colorPicker(scheme, palette, words) {
  if (scheme === 'mono') return () => BRAND_NAVY;
  if (scheme === 'random') return (word) => deterministicReadableColor(word);
  if (scheme === 'custom' && palette && palette.length > 0) {
    return (word) => palette[strHash(word) % palette.length];
  }
  if (scheme === 'custom_gradient' && palette && palette.length > 0) {
    if (palette.length === 1) return () => palette[0];
    let min = Infinity;
    let max = -Infinity;
    for (const [, c] of words ?? []) {
      if (c < min) min = c;
      if (c > max) max = c;
    }
    if (!isFinite(min) || !isFinite(max) || max === min) {
      return () => palette[0];
    }
    const range = max - min;
    return (_word, count) => interpolateStops(palette, (count - min) / range);
  }
  return () => BRAND_NAVY;
}

// Совпадает с константой `SIZE_MULTIPLIER` в src/lib/cloud.ts. При
// расхождении сайт и письмо нарисуют разные пропорции шрифтов.
const SIZE_MULTIPLIER = 5.5;

function weightFactor(words, baseSize) {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count) =>
    baseSize * (1 + (Math.log2(count + 1) / denom) * (SIZE_MULTIPLIER - 1));
}

function fontWeightFor(words) {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count) => {
    const t = Math.log2(count + 1) / denom;
    if (t >= 0.85) return 700;
    if (t >= 0.55) return 600;
    if (t >= 0.25) return 500;
    return 400;
  };
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
  const { words, scheme, palette, width, height, maxWords, allowVertical } = job;
  if (!Array.isArray(words) || words.length === 0) {
    return drawEmpty(width, height, 'Нет ответов');
  }

  // Сортировка по убыванию count + обрезка до maxWords. d3-cloud сам
  // сортирует по `size` — но без обрезки длинный хвост рисуется как
  // «звёздная пыль» по краям. Здесь же гарантируем, что в layout
  // улетают только топ-N слов с наибольшими голосами.
  const limit = Math.max(1, maxWords ?? 50);
  const sorted = [...words].sort((a, b) => b[1] - a[1]).slice(0, limit);

  const wf = weightFactor(sorted, 28);
  const color = colorPicker(scheme, palette, sorted);
  const weights = fontWeightFor(sorted);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Детерминированный псевдо-RNG (mulberry32) с фиксированным seed.
  // d3-cloud в дефолте использует Math.random() для (а) стартовой точки
  // каждого слова, (б) направления спирали (CW/CCW). Из-за пункта (а)
  // даже самое крупное слово получало случайную позицию в пределах
  // центральной полосы — и облако в письме выглядело «рандомно
  // разбросанным», непохожим на сайт. С детерминированным random:
  //   - стартовая точка стабильна для одних и тех же входных данных;
  //   - первое (самое крупное после .sort()) слово, с высокой
  //     вероятностью занимающее радиус 0, ложится около центра.
  // mulberry32 — быстрый, маленький, без зависимостей; seed 0xC0DE
  // подобран эмпирически для «компактного» layout на 1200×800.
  let rngState = 0xc0de;
  const rng = () => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  await new Promise((resolve, reject) => {
    const layout = cloud()
      .size([width, height])
      .canvas(() => createCanvas(1, 1))
      .words(
        sorted.map(([text, count]) => ({
          text,
          size: wf(count),
          count,
          weight: weights(count)
        }))
      )
      // Padding=8: совпадает с клиентом (`src/lib/cloud-render.ts`),
      // даёт визуальный воздух между словами и снижает шанс
      // наложения для повёрнутых спрайтов.
      .padding(8)
      .random(rng)
      // Если опрос разрешает вертикали — ~40% слов ставятся под ±90°
      // (равновероятно влево/вправо), остальные — горизонтально.
      // Логика 50/50 между −90° и +90° совпадает с настройками
      // wordcloud2.js на фронте: rotateRatio=0.4, rotationSteps=1,
      // minRotation=-π/2, maxRotation=π/2.
      .rotate(() => {
        if (!allowVertical) return 0;
        if (rng() >= 0.4) return 0;
        return rng() < 0.5 ? -90 : 90;
      })
      .font(FONT)
      .fontSize((d) => d.size)
      .fontWeight((d) => String(d.weight))
      .on('end', (placed) => {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const w of placed) {
          ctx.font = `${w.weight} ${w.size}px ${FONT}`;
          ctx.fillStyle = color(w.text ?? '', w.count ?? 0);
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
