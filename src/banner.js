import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1000;
const HEIGHT = 640;
// satori считает padding сверх width: внутренний блок 912 + 2 × 44 = 1000
const INNER_WIDTH = 912;
const INNER_HEIGHT = 552;
const PAD = 44;
// Ширина карточки внутри внутреннего блока: 912 = 2 × (card + 52) + 20
const CARD = 394;
const FULL = INNER_WIDTH - 52;

const SANS = 'DejaVu Sans';
const MONO = 'DejaVu Sans Mono';

const ACCENT = 'linear-gradient(90deg, #7c6cff 0%, #3ba3ff 100%)';
const WARM = 'linear-gradient(90deg, #ffbe5c 0%, #ff9a3d 100%)';
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
      padding: '20px 26px',
      borderRadius: 18,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.10)',
      ...style,
    },
    children,
  );

const label = (text) => box({ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: '#a9a3cf' }, [text]);

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

// Баннер сбора: название, дата, время, подключение и пароль. Возвращает PNG
export async function renderBanner(data) {
  const tree = box(
    {
      width: WIDTH,
      height: HEIGHT,
      background: BACKGROUND,
      color: '#ffffff',
      fontFamily: SANS,
    },
    [
      box(
        {
          flexDirection: 'column',
          width: INNER_WIDTH,
          height: INNER_HEIGHT,
          padding: PAD,
        },
        [
          box({ justifyContent: 'space-between', alignItems: 'center' }, [
            box({ background: ACCENT, borderRadius: 999, padding: '10px 26px', fontSize: 24, fontWeight: 700 }, ['ВАЙП']),
            box({ fontSize: 20, color: '#b9b3d6' }, ['Время указано по МСК']),
          ]),
          box({ flexDirection: 'column', marginTop: 24 }, [
            box({ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }, [data.title]),
            box({ width: 180, height: 4, background: ACCENT, borderRadius: 2, marginTop: 12 }),
          ]),
          box({ marginTop: 30 }, [
            card({ width: CARD }, [
              label('ДАТА ВАЙПА'),
              box({ fontSize: 34, fontWeight: 700, marginTop: 8 }, [dateLongMoscow(data.startsUnix)]),
              box({ fontSize: 20, color: '#8fd2ff', marginTop: 4 }, [data.weekday]),
            ]),
            box({ width: 20 }),
            card({ width: CARD }, [label('НАЧАЛО (МСК)'), box({ fontSize: 58, fontWeight: 700, marginTop: 2 }, [data.time])]),
          ]),
          card({ width: FULL, marginTop: 20 }, [
            label('ПОДКЛЮЧЕНИЕ'),
            box({ fontFamily: MONO, fontSize: 32, fontWeight: 700, marginTop: 6 }, [data.connect]),
          ]),
          box(
            {
              width: FULL,
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 18,
              padding: '18px 26px',
              borderRadius: 18,
              background: WARM,
              color: '#1d1305',
            },
            [
              box({ fontSize: 20, fontWeight: 700, letterSpacing: 2 }, ['ПАРОЛЬ']),
              box({ fontFamily: MONO, fontSize: 46, fontWeight: 700, letterSpacing: 10 }, [data.password]),
            ],
          ),
        ],
      ),
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

// Иконка-эмодзи для кнопок: цветной круг с символом. Возвращает PNG 128×128
export async function renderIcon(symbol, color) {
  const tree = box(
    { width: 128, height: 128, borderRadius: 64, background: color, alignItems: 'center', justifyContent: 'center' },
    [box({ fontSize: 76, fontWeight: 700, color: '#ffffff', fontFamily: SANS }, [symbol])],
  );
  const svg = await satori(tree, { width: 128, height: 128, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().asPng();
}
