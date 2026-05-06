import type { CloudWord, ColorScheme } from './types/cloud';
import { palette as brand } from './theme';

/**
 * HSL → HEX. Параметры в градусах/процентах.
 * Используется для генерации читаемых случайных цветов на белом фоне.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const c = lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Стабильный 32-битный хэш строки (FNV-1a-like). Используем для
 * детерминированной раскраски: одинаковое слово даёт одинаковый цвет
 * между перезагрузками страницы и письмом, что фиксит баг с
 * «прыгающими» цветами при F5.
 */
function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Детерминированно выводит читаемый цвет (saturation 70%, lightness 38%)
 * по hash-у слова. Палитра «brand-friendly»: тёмные насыщенные тона на
 * белом фоне. Воспроизводимо: одно и то же слово → один и тот же цвет.
 */
function deterministicReadableColor(word: string): string {
  const h = strHash(word) % 360;
  return hslToHex(h, 72, 38);
}

/**
 * #RRGGBB → [r, g, b]. Без валидации — на входе уже отвалидированный hex
 * (проверяется в zod-схеме создания опроса).
 */
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace(/^#/, '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Линейная интерполяция между двумя hex-цветами по t ∈ [0,1].
 */
function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Многосегментная интерполяция по списку стопов: t=0 → stops[0], t=1 →
 * stops[N-1]. С N стопами получаем (N-1) сегмент равной ширины.
 * Используется в colorScheme=`custom_gradient` для раскраски слов
 * по популярности.
 */
export function interpolateStops(stops: string[], t: number): string {
  if (stops.length === 0) return brand.navy;
  if (stops.length === 1) return stops[0];
  const tt = Math.max(0, Math.min(1, t));
  const seg = (stops.length - 1) * tt;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const local = seg - i;
  return lerpHex(stops[i], stops[i + 1], local);
}

export type ColorPicker = (word: string, count: number) => string;

/**
 * Возвращает функцию, которая по (слово, count) выдаёт цвет.
 *
 * Все режимы детерминированы по входу — это лечит баг, при котором
 * перезагрузка страницы перерисовывала облако «другими» цветами:
 *   - 'mono'             — фирменный navy, безусловно;
 *   - 'random'           — HSL по hash-у слова (фикс. saturation/lightness);
 *   - 'custom'           — индекс в палитре по hash-у слова;
 *   - 'custom_gradient'  — линейная интерполяция стопов по count.
 *
 * `words` нужен только для 'custom_gradient' (чтобы посчитать min/max);
 * для остальных схем игнорируется.
 */
export function colorPicker(
  scheme: ColorScheme,
  palette?: string[] | null,
  words?: CloudWord[]
): ColorPicker {
  if (scheme === 'mono') return () => brand.navy;
  if (scheme === 'random') return (word) => deterministicReadableColor(word);

  if (scheme === 'custom' && palette && palette.length > 0) {
    const p = palette;
    return (word) => p[strHash(word) % p.length];
  }

  if (scheme === 'custom_gradient' && palette && palette.length > 0) {
    const p = palette;
    if (p.length === 1) return () => p[0];

    const counts = (words ?? []).map(([, c]) => c);
    let min = Infinity;
    let max = -Infinity;
    for (const c of counts) {
      if (c < min) min = c;
      if (c > max) max = c;
    }
    // На пустом/одинаковом наборе t всегда 0 — отдадим первый стоп,
    // чтобы UI не падал и не делил на ноль.
    if (!isFinite(min) || !isFinite(max) || max === min) {
      return () => p[0];
    }
    const range = max - min;
    return (_word, count) => interpolateStops(p, (count - min) / range);
  }

  return () => brand.navy;
}

/**
 * Шкалирование размера шрифта по count. Логарифмическое — плотные «хвосты»
 * не «съедают» центр (если max=1000, а большинство слов с count<10).
 *
 * Возвращает baseSize..baseSize×4: даёт явное визуальное превосходство
 * самого популярного слова без того, чтобы оно вылезало за холст.
 */
export function weightFactor(words: CloudWord[], baseSize: number) {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count: number) => baseSize * (1 + (Math.log2(count + 1) / denom) * 3);
}

/**
 * Подбор font-weight по популярности. Самые редкие слова рисуются обычным
 * 400, самые частые — 700 (bold), середина — 500/600. Это усиливает
 * визуальную иерархию за счёт начертания дополнительно к размеру.
 */
export function fontWeightFor(words: CloudWord[]): (count: number) => number {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count) => {
    const t = Math.log2(count + 1) / denom; // 0..1
    if (t >= 0.85) return 700;
    if (t >= 0.55) return 600;
    if (t >= 0.25) return 500;
    return 400;
  };
}

/**
 * Опции для wordcloud2.js (клиент). Соответствует серверному
 * рендеру (`workers/render-worker.mjs`):
 *   1) input всегда отсортирован по count DESC — wordcloud library
 *      кладёт первое слово в центр (radius=0), что фиксит «попап в
 *      центре самого популярного» как на сайте, так и в письме;
 *   2) `gridSize`/`shrinkToFit` подобраны под холст 1200×700;
 *   3) `rotateRatio=0` по умолчанию (горизонтально); включается только
 *      если опрос разрешает вертикальную ориентацию (`allowVertical`).
 */
export function buildWordCloudOptions(
  words: CloudWord[],
  scheme: ColorScheme,
  palette: string[] | null,
  opts: {
    baseSize?: number;
    backgroundColor?: string;
    fontFamily?: string;
    maxWords?: number;
    allowVertical?: boolean;
  } = {}
) {
  const limit = Math.max(1, opts.maxWords ?? 50);
  const sorted = [...words].sort((a, b) => b[1] - a[1]).slice(0, limit);

  const pick = colorPicker(scheme, palette, sorted);
  const weights = fontWeightFor(sorted);

  return {
    list: sorted,
    weightFactor: weightFactor(sorted, opts.baseSize ?? 18),
    color: (word: string, weight: number) => pick(word, weight),
    fontWeight: (word: string, weight: number) => String(weights(weight)),
    backgroundColor: opts.backgroundColor ?? '#FFFFFF',
    fontFamily: opts.fontFamily ?? "'Inter', sans-serif",
    rotateRatio: opts.allowVertical ? 0.4 : 0,
    rotationSteps: 2,
    minRotation: -Math.PI / 2,
    maxRotation: Math.PI / 2,
    shrinkToFit: true,
    minSize: 10,
    gridSize: 8,
    drawOutOfBound: false,
    // Без shuffle первое (самое крупное) слово гарантированно ложится в
    // центр (radius=0), а не в случайную точку на нулевом радиусе.
    shuffle: false
  };
}
