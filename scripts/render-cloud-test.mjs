// Генерирует серверные PNG-облака с разными датасетами для визуальной проверки.
// Использует тот же render-png который потом идёт в email.
import { writeFile, mkdir } from 'node:fs/promises';

// важно: чтобы lib/cloud (theme.ts) импортировался корректно
process.env.DATABASE_URL ||= 'postgres://tagcloud:tagcloud_dev@localhost:5432/tagcloud';
process.env.REDIS_URL ||= 'redis://localhost:6379';

const { renderPng } = await import('../src/lib/server/cloud/render-png.ts');

const OUT = '/tmp/cloud-tests';
await mkdir(OUT, { recursive: true });

const datasets = {
  empty: [],
  tiny: [
    ['радость', 5],
    ['страх', 3],
    ['скука', 1]
  ],
  medium: [
    ['кофе', 12],
    ['чай', 8],
    ['сон', 7],
    ['работа', 6],
    ['музыка', 5],
    ['книга', 5],
    ['прогулка', 4],
    ['спорт', 4],
    ['друзья', 3],
    ['отдых', 3],
    ['кино', 2],
    ['игры', 2],
    ['еда', 2],
    ['путешествие', 1],
    ['медитация', 1]
  ],
  large: Array.from({ length: 60 }, (_, i) => {
    const words = [
      'альфа',
      'бета',
      'гамма',
      'дельта',
      'эпсилон',
      'зета',
      'эта',
      'тета',
      'йота',
      'каппа',
      'лямбда',
      'мю',
      'ню',
      'кси',
      'омикрон',
      'пи',
      'ро',
      'сигма',
      'тау',
      'ипсилон',
      'фи',
      'хи',
      'пси',
      'омега',
      'один',
      'два',
      'три',
      'четыре',
      'пять',
      'шесть',
      'свет',
      'тьма',
      'день',
      'ночь',
      'утро',
      'вечер',
      'солнце',
      'луна',
      'звёзды',
      'планета',
      'дом',
      'семья',
      'школа',
      'учёба',
      'знания',
      'книги',
      'наука',
      'искусство',
      'музыка',
      'танец',
      'друг',
      'любовь',
      'счастье',
      'смех',
      'улыбка',
      'мечта',
      'цель',
      'путь',
      'выбор',
      'время'
    ];
    return [words[i], Math.max(1, Math.round(50 / (i + 1)))];
  }),
  longWords: [
    ['самореализация', 8],
    ['достопримечательность', 5],
    ['ответственность', 4],
    ['взаимопонимание', 3],
    ['сосредоточенность', 2],
    ['благожелательность', 1]
  ]
};

const schemes = [
  { name: 'mono', scheme: 'mono', palette: null },
  { name: 'random', scheme: 'random', palette: null },
  { name: 'custom-warm', scheme: 'custom', palette: ['#E94B3C', '#F4A261', '#E76F51'] },
  { name: 'custom-cool', scheme: 'custom', palette: ['#264653', '#2A9D8F', '#8AB17D'] }
];

const SIZE = { width: 1200, height: 800 };

console.log('Generating cloud test images...');
for (const [dsName, words] of Object.entries(datasets)) {
  for (const sch of schemes) {
    const filename = `${OUT}/cloud-${dsName}-${sch.name}.png`;
    const t0 = Date.now();
    const buf = await renderPng(words, sch.scheme, sch.palette, SIZE);
    await writeFile(filename, buf);
    console.log(`  ${Date.now() - t0}ms  ${filename}  (${words.length} words)`);
  }
}
console.log(`\nDone. ${Object.keys(datasets).length * schemes.length} files in ${OUT}/`);
