import { readFileSync } from 'node:fs';
import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const rulesConfig = JSON.parse(readFileSync(new URL('../config/rules.json', import.meta.url), 'utf8'));

// Карточки правил: по одной на раздел плюс заголовок. Все карточки набора одного размера,
// чтобы в Discord они шли ровным столбиком. satori считает padding сверх width, поэтому
// внутренний блок = ширина − 2 × PAD.
const WIDTH = 1000;
const PAD = 56;
const INNER = WIDTH - PAD * 2;
const BADGE = 96;
const GAP = 32;
const TEXT_WIDTH = INNER - BADGE - GAP;
const DOT = 10;
const DOT_GAP = 18;
const BULLET_TEXT_WIDTH = TEXT_WIDTH - DOT - DOT_GAP;

const TOP_LABEL = 44;
const TITLE_SIZE = 38;
const TITLE_LINE = 50;
const BULLET_SIZE = 28;
const BULLET_LINE = 40;
const BULLET_GAP = 12;
// Сколько символов помещается в строку (оценка с запасом, чтобы текст не упирался в край)
const TITLE_CHARS = 30;
const BULLET_CHARS = 42;

const SANS = 'DejaVu Sans';
const ACCENT = 'linear-gradient(135deg, #7c6cff 0%, #3ba3ff 100%)';
const BACKGROUND = [
  'radial-gradient(circle at 92% 0%, rgba(124, 108, 255, 0.40) 0%, rgba(124, 108, 255, 0) 45%)',
  'radial-gradient(circle at 0% 100%, rgba(59, 163, 255, 0.24) 0%, rgba(59, 163, 255, 0) 40%)',
  'linear-gradient(135deg, #22194a 0%, #120e26 62%, #0b0917 100%)',
].join(', ');

const font = (file, weight) => ({
  name: SANS,
  data: readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)),
  weight,
  style: 'normal',
});
const fonts = [font('DejaVuSans.ttf', 400), font('DejaVuSans-Bold.ttf', 700)];

const box = (style, children = []) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

// «1. Общие правила» → «Общие правила»: номер и так стоит в значке слева
export const cleanTitle = (title) => title.replace(/^\s*\d+[.)]\s*/, '');

const lineCount = (text, perLine) => Math.max(1, Math.ceil(text.length / perLine));

function sectionTextHeight(section) {
  const title = lineCount(cleanTitle(section.title), TITLE_CHARS) * TITLE_LINE;
  const bullets = section.bullets.reduce((sum, b) => sum + lineCount(b, BULLET_CHARS) * BULLET_LINE + BULLET_GAP, 0);
  return title + bullets;
}

// Высота всех карточек набора: по самому длинному разделу, чтобы карточки были одинаковыми
export function cardHeight(sections) {
  const header = 260;
  const tallest = Math.max(...sections.map(sectionTextHeight));
  return PAD * 2 + TOP_LABEL + Math.max(tallest, header);
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const topLabel = (left, right) =>
  box({ height: TOP_LABEL, justifyContent: 'space-between', alignItems: 'flex-start' }, [
    box({ fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#a9a3cf' }, [left]),
    box({ fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#a9a3cf' }, [right]),
  ]);

const frame = (height, children) =>
  box({ width: WIDTH, height, background: BACKGROUND, fontFamily: SANS, color: '#ffffff' }, [
    box({ flexDirection: 'column', width: INNER, height: height - PAD * 2, padding: PAD }, children),
  ]);

async function toPng(tree, height) {
  const svg = await satori(tree, { width: WIDTH, height, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

// Заголовок набора правил: та же карточка, крупное название и число разделов
export async function renderRulesHeader({ heading, sectionCount, height }) {
  const tree = frame(height, [
    topLabel('2PZ', `${sectionCount} ${plural(sectionCount, 'РАЗДЕЛ', 'РАЗДЕЛА', 'РАЗДЕЛОВ')}`),
    box({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
      box({ background: ACCENT, borderRadius: 999, padding: '8px 24px', fontSize: 22, fontWeight: 700, alignSelf: 'flex-start' }, [
        'ПРАВИЛА',
      ]),
      box({ fontSize: 76, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }, [heading]),
      box({ width: 220, height: 5, background: ACCENT, borderRadius: 3, marginTop: 18 }),
      box({ fontSize: 26, color: '#b9b3d6', marginTop: 22 }, ['Прочитайте разделы ниже']),
    ]),
  ]);
  return toPng(tree, height);
}

// Карточка одного раздела: номер в значке слева, справа название и пункты
export async function renderRulesCard({ heading, section, index, total, height }) {
  const number = String(index).padStart(2, '0');
  const tree = frame(height, [
    topLabel(heading.toUpperCase(), `${index} / ${total}`),
    box({ flexGrow: 1, alignItems: 'center' }, [
      box(
        {
          width: BADGE,
          height: BADGE,
          borderRadius: 26,
          background: ACCENT,
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 40,
          fontWeight: 700,
          flexShrink: 0,
        },
        [number],
      ),
      box({ width: GAP, flexShrink: 0 }),
      box({ flexDirection: 'column', width: TEXT_WIDTH }, [
        box({ fontSize: TITLE_SIZE, fontWeight: 700, lineHeight: TITLE_LINE / TITLE_SIZE }, [cleanTitle(section.title)]),
        ...section.bullets.map((bullet) =>
          box({ marginTop: BULLET_GAP, alignItems: 'flex-start' }, [
            box({
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              background: '#8f84ff',
              marginTop: (BULLET_LINE - DOT) / 2,
              marginRight: DOT_GAP,
              flexShrink: 0,
            }),
            box(
              { width: BULLET_TEXT_WIDTH, fontSize: BULLET_SIZE, lineHeight: BULLET_LINE / BULLET_SIZE, color: '#e7e4f5' },
              [bullet],
            ),
          ]),
        ),
      ]),
    ]),
  ]);
  return toPng(tree, height);
}

// Весь набор: заголовок и карточки разделов одинакового размера. Возвращает [{ name, png }]
export async function renderRulesSet(key, set) {
  const height = cardHeight(set.sections);
  const total = set.sections.length;
  const images = [
    { name: `${key}-00.png`, png: await renderRulesHeader({ heading: set.heading, sectionCount: total, height }) },
  ];
  for (let i = 0; i < total; i += 1) {
    const index = i + 1;
    const png = await renderRulesCard({ heading: set.heading, section: set.sections[i], index, total, height });
    images.push({ name: `${key}-${String(index).padStart(2, '0')}.png`, png });
  }
  return images;
}

// Команда /rules: публикует правила (публичные и клановые) и закрепляет их в выбранном канале
export const RULES_COMMAND = {
  name: 'rules',
  description: 'Опубликовать и закрепить правила сервера картинками',
  options: [
    {
      name: 'channel',
      description: 'Канал для правил (по умолчанию текущий)',
      type: ApplicationCommandOptionType.Channel,
      channel_types: [ChannelType.GuildText],
      required: false,
    },
  ],
};
