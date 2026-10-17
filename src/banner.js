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

const ACCENT = 'linear-gradient(90deg, #7c6cff 0%, #3ba3ff 100%)';
const WARM = 'linear-gradient(90deg, #ffbe5c 0%, #ff9a3d 100%)';

const font = (file, weight) => ({
  name: 'DejaVu Sans',
  data: readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)),
  weight,
  style: 'normal',
});
// DejaVu Sans содержит и кириллицу, и латиницу, и цифры в одном файле (satori не переключает шрифты по символам)
const fonts = [font('DejaVuSans.ttf', 400), font('DejaVuSans-Bold.ttf', 700)];

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

function dateLongMoscow(startsUnix) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(startsUnix * 1000));
}

// Баннер сбора: название, дата, время, подключение и пароль. Возвращает PNG
export async function renderBanner(data) {
  const tree = box(
    {
      width: WIDTH,
      height: HEIGHT,
      background: 'linear-gradient(135deg, #2b2058 0%, #120e26 60%, #0c0a18 100%)',
      color: '#ffffff',
      fontFamily: 'DejaVu Sans',
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
            box({ fontSize: 32, fontWeight: 700, marginTop: 6 }, [data.connect]),
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
              box({ fontSize: 46, fontWeight: 700, letterSpacing: 10 }, [data.password]),
            ],
          ),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}
