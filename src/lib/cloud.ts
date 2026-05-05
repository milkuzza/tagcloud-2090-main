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
 * Случайный цвет в области HSL: hue произвольный, saturation 65–85%,
 * lightness 30–50%. Это даёт яркие, но не кислотные цвета, читаемые
 * на белом фоне облака.
 */
function randomReadableColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 65 + Math.floor(Math.random() * 20);
  const l = 30 + Math.floor(Math.random() * 20);
  return hslToHex(h, s, l);
}

export function colorPicker(scheme: ColorScheme, palette?: string[] | null): () => string {
  if (scheme === 'mono') return () => brand.navy;
  if (scheme === 'random') return randomReadableColor;
  if (scheme === 'custom' && palette && palette.length > 0) {
    const p = palette;
    return () => p[Math.floor(Math.random() * p.length)];
  }
  return () => brand.navy;
}

export function weightFactor(words: CloudWord[], baseSize: number) {
  const max = Math.max(1, ...words.map((w) => w[1]));
  const denom = Math.log2(max + 1);
  return (count: number) => baseSize * (1 + (Math.log2(count + 1) / denom) * 3);
}

export function buildWordCloudOptions(
  words: CloudWord[],
  scheme: ColorScheme,
  palette: string[] | null,
  opts: { baseSize?: number; backgroundColor?: string; fontFamily?: string } = {}
) {
  return {
    list: words,
    weightFactor: weightFactor(words, opts.baseSize ?? 18),
    color: colorPicker(scheme, palette),
    backgroundColor: opts.backgroundColor ?? '#FFFFFF',
    fontFamily: opts.fontFamily ?? "'Inter', sans-serif",
    rotateRatio: 0,
    shrinkToFit: true,
    minSize: 10,
    gridSize: 8,
    drawOutOfBound: false
  };
}
