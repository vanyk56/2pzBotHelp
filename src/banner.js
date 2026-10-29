import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1000;
const HEIGHT = 540;
const PAD_X = 44;
const PAD_Y = 32;
const INNER_WIDTH = WIDTH - PAD_X * 2; // 912

const SANS = 'DejaVu Sans';
const MONO = 'DejaVu Sans Mono';

const ACCENT = 'linear-gradient(90deg, #7c6cff 0%, #3ba3ff 100%)';
// Тёмный фон как в образце: мягкое фиолетовое свечение справа вверху и синее слева внизу
const BACKGROUND = [
  'radial-gradient(circle at 88% 10%, rgba(124, 108, 255, 0.42) 0%, rgba(124, 108, 255, 0) 42%)',
  'radial-gradient(circle at 6% 100%, rgba(59, 163, 255, 0.28) 0%, rgba(59, 163, 255, 0) 38%)',
  'linear-gradient(135deg, #22194a 0%, #120e26 62%, #0b0917 100%)',
].join(', ');

const font = (file, weight, name) => ({
  name,
  data: readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)),
  weight,
  style: 'normal',
});
// DejaVu содержит кириллицу, латиницу и цифры в одном файле (satori не переключает шрифты по символам)
const fonts = [
  font('DejaVuSans.ttf', 400, SANS),
  font('DejaVuSans-Bold.ttf', 700, SANS),
  font('DejaVuSansMono-Bold.ttf', 700, MONO),
];

// satori принимает деревья { type, props } без React: каждый блок — flex-контейнер
const box = (style, children = []) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

const card = (style, children) =>
  box(
    {
      flexDirection: 'column',
      padding: '14px 20px',
      borderRadius: 16,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.10)',
      ...style,
    },
    children,
  );

const label = (text) => box({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#a9a3cf' }, [text]);

// «12 декабря 2026» без «г.», как в образце
function dateLongMoscow(startsUnix) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  })
    .format(new Date(startsUnix * 1000))
    .replace(/\s*г\.?$/, '');
}

// Баннер сбора: название, дата, время, подключение и (опционально) клетка карты. Возвращает PNG
export async function renderBanner(data) {
  const hasGrid = Boolean(data.grid);
  const titleLen = (data.title || '').length;
  const titleSize = titleLen > 35 ? 36 : titleLen > 22 ? 44 : 54;

  const middleRow = hasGrid
    ? [
        card({ flex: 1 }, [
          label('ДАТА ВАЙПА'),
          box({ fontSize: 24, fontWeight: 700, marginTop: 4 }, [dateLongMoscow(data.startsUnix)]),
          box({ fontSize: 15, color: '#8fd2ff', marginTop: 2 }, [data.weekday]),
        ]),
        box({ width: 14 }),
        card({ flex: 1 }, [
          label('НАЧАЛО (МСК)'),
          box({ fontSize: 40, fontWeight: 700, marginTop: 2 }, [data.time]),
        ]),
        box({ width: 14 }),
        card({ flex: 1, background: 'rgba(59, 163, 255, 0.12)', border: '1px solid rgba(59, 163, 255, 0.35)' }, [
          label('КВАДРАТ КАРТЫ'),
          box({ fontSize: 40, fontWeight: 700, color: '#ffffff', marginTop: 2 }, [data.grid]),
          box({ fontSize: 12, color: '#8fd2ff', marginTop: 2 }, ['ЗОНА СТРОЙКИ']),
        ]),
      ]
    : [
        card({ flex: 1 }, [
          label('ДАТА ВАЙПА'),
          box({ fontSize: 28, fontWeight: 700, marginTop: 4 }, [dateLongMoscow(data.startsUnix)]),
          box({ fontSize: 16, color: '#8fd2ff', marginTop: 2 }, [data.weekday]),
        ]),
        box({ width: 20 }),
        card({ flex: 1 }, [
          label('НАЧАЛО (МСК)'),
          box({ fontSize: 46, fontWeight: 700, marginTop: 2 }, [data.time]),
        ]),
      ];

  const tree = box(
    {
      width: WIDTH,
      height: HEIGHT,
      background: BACKGROUND,
      color: '#ffffff',
      fontFamily: SANS,
      padding: `${PAD_Y}px ${PAD_X}px`,
      flexDirection: 'column',
    },
    [
      box({ width: INNER_WIDTH, justifyContent: 'space-between', alignItems: 'center' }, [
        box({ background: ACCENT, borderRadius: 999, padding: '6px 20px', fontSize: 18, fontWeight: 700 }, ['ВАЙП']),
        box({ fontSize: 16, color: '#b9b3d6' }, ['Время указано по МСК']),
      ]),
      box({ width: INNER_WIDTH, flexDirection: 'column', marginTop: 14 }, [
        box({ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15 }, [data.title]),
        box({ width: 140, height: 4, background: ACCENT, borderRadius: 2, marginTop: 8 }),
      ]),
      box({ width: INNER_WIDTH, alignItems: 'stretch', marginTop: 16 }, middleRow),
      card({ width: INNER_WIDTH, marginTop: 14, padding: '14px 20px' }, [
        label('ПОДКЛЮЧЕНИЕ'),
        box({ fontFamily: MONO, fontSize: 24, fontWeight: 700, marginTop: 4, color: '#ffffff' }, [data.connect]),
      ]),
    ],
  );

  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

// Квадрат карты с координатой, например G12: зона, где строится клан. Возвращает PNG 400×400
export async function renderGrid(coordinate) {
  const cell = () => box({ flexGrow: 1, border: '1px solid rgba(255,255,255,0.20)' });
  const row = () => box({ flexGrow: 1 }, [cell(), cell(), cell(), cell()]);
  const layer = (children) =>
    box({ position: 'absolute', top: 0, left: 0, width: 400, height: 400, flexDirection: 'column' }, children);

  const tree = box(
    { width: 400, height: 400, background: 'linear-gradient(135deg, #2a2160 0%, #100c24 100%)', fontFamily: SANS },
    [
      layer([row(), row(), row(), row()]),
      box(
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: 400,
          height: 400,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        },
        [
          box({ fontSize: 104, fontWeight: 700, color: '#ffffff' }, [coordinate]),
          box({ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: '#8fd2ff', marginTop: 6 }, ['ЗОНА СТРОИТЕЛЬСТВА']),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: 400, height: 400, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 400 } }).render().asPng();
}

// Иконка-эмодзи для кнопок: скруглённый квадрат с градиентом и белым символом из SVG-штрихов.
// icon = { gradient, shapes }. Возвращает PNG 128×128
export async function renderIcon({ gradient, shapes }) {
  const strokes = shapes.map(({ tag, ...attrs }) => ({ type: tag, props: attrs }));
  const glyph = {
    type: 'svg',
    props: {
      width: 76,
      height: 76,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: '#ffffff',
      strokeWidth: 2.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      children: strokes,
    },
  };
  const tree = box(
    {
      width: 128,
      height: 128,
      borderRadius: 36,
      background: gradient,
      alignItems: 'center',
      justifyContent: 'center',
    },
    [glyph],
  );
  const svg = await satori(tree, { width: 128, height: 128, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().asPng();
}
