import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { colorPicker, weightFactor } from '../../src/lib/cloud';

describe('colorPicker', () => {
  beforeEach(() => {
    // Math.random детерминируем — иначе random/custom возвращает что попало.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mono всегда возвращает один и тот же brand-цвет', () => {
    const pick = colorPicker('mono');
    expect(pick()).toBe(pick());
  });

  it('random возвращает читаемый HEX-цвет (не из brand-палитры)', () => {
    const pick = colorPicker('random');
    const c = pick();
    expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('custom использует переданную палитру', () => {
    const pick = colorPicker('custom', ['#AA0000', '#00BB00', '#0000CC']);
    // С Math.random=0.5 получаем индекс 1 из массива из 3.
    expect(pick()).toBe('#00BB00');
  });

  it('custom без палитры падает обратно на brand-цвет', () => {
    const pick = colorPicker('custom', null);
    const c = pick();
    expect(c).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
  });

  it('custom с пустой палитрой падает обратно на brand-цвет', () => {
    const pick = colorPicker('custom', []);
    const c = pick();
    expect(c).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
  });
});

describe('weightFactor', () => {
  it('возвращает baseSize для слова с count=0', () => {
    const wf = weightFactor(
      [
        ['a', 0],
        ['b', 1]
      ],
      28
    );
    // Math.log2(0+1) = 0, baseSize * (1 + 0) = baseSize
    expect(wf(0)).toBe(28);
  });

  it('самое частое слово получает максимум', () => {
    const wf = weightFactor(
      [
        ['a', 1],
        ['b', 10]
      ],
      28
    );
    // Math.log2(10+1)/Math.log2(11) = 1, baseSize * (1 + 3) = 4×baseSize
    expect(wf(10)).toBe(28 * 4);
  });

  it('пустой массив не делит на ноль (Math.max ставит max=1)', () => {
    const wf = weightFactor([], 18);
    // Math.log2(1+1) = 1, denom=1; для count=1 → baseSize × (1 + 1/1 × 3) = 4×base.
    expect(wf(1)).toBe(72);
  });
});
