export type CloudWord = [string, number];

/**
 * Цветовые схемы:
 *   - 'mono'             — одна навигационная заливка (фирменный navy);
 *   - 'random'           — детерминированный случайный цвет на слово
 *                          (hash от слова → HSL);
 *   - 'custom'           — пользовательская палитра, случайный выбор из неё
 *                          по слову (детерминированно);
 *   - 'custom_gradient'  — пользовательская палитра как стопы градиента;
 *                          цвет слова = линейная интерполяция по
 *                          популярности (count) от min к max.
 */
export type ColorScheme = 'mono' | 'random' | 'custom' | 'custom_gradient';

export type ServerMsg =
  | { type: 'snapshot'; questionId: string; words: CloudWord[] }
  | { type: 'closed'; reason: 'expired' | 'sent' | 'failed' };

export type ClientMsg = { type: 'ping' };
