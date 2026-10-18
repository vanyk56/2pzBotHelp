import { readFileSync } from 'node:fs';
import { ApplicationCommandOptionType, ChannelType } from 'discord.js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const rulesConfig = JSON.parse(readFileSync(new URL('../config/rules.json', import.meta.url), 'utf8'));

// Карточки правил в том же стиле, что баннер сбора. Ширина 1000, внутренний блок 904 (+ отступы 48)
const WIDTH = 1000;
const PAD = 48;
const INNER = WIDTH - PAD * 2;
const CARD_PAD_X = 26;
const CARD_PAD_Y = 22;
const CARD_INNER = INNER - CARD_PAD_X * 2;
const BULLET_TEXT_WIDTH = CARD_INNER - 28;
const CHARS_PER_LINE = 62;
const BULLET_LINE = 34;
const SECTIONS_PER_PAGE = 4;

const SANS = 'DejaVu Sans';
const ACCENT = 'linear-gradient(90deg, #7c6cff 0%, #3ba3ff 100%)';
const BACKGROUND = [
  'radial-gradient(circle at 88% 6%, rgba(124, 108, 255, 0.38) 0%, rgba(124, 108, 255, 0) 40%)',
  'radial-gradient(circle at 4% 100%, rgba(59, 163, 255, 0.25) 0%, rgba(59, 163, 255, 0) 36%)',
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

// Высота карточки раздела по числу строк (оценка: текст переносится примерно по 62 символа)
const bulletLines = (text) => Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
const sectionHeight = (section) =>
  2 * CARD_PAD_Y + 44 + section.bullets.reduce((sum, b) => sum + bulletLines(b) * BULLET_LINE + 10, 0) + 16;

function pageHeight(sections) {
  const header = 150;
  return PAD + header + sections.reduce((sum, s) => sum + sectionHeight(s), 0) + PAD;
}

// Разбивает разделы на страницы, чтобы в одном изображении было не больше SECTIONS_PER_PAGE разделов
export function paginate(sections) {
  const pages = [];
  for (let i = 0; i < sections.length; i += SECTIONS_PER_PAGE) pages.push(sections.slice(i, i + SECTIONS_PER_PAGE));
  return pages;
}

// Одна страница правил: заголовок и карточки разделов. Возвращает PNG
export async function renderRulesPage({ heading, sections, page, pages }) {
  const height = pageHeight(sections);
  const title = pages > 1 ? `${heading} · ${page}/${pages}` : heading;

  const sectionCard = (section, index) =>
    box(
      {
        flexDirection: 'column',
        width: CARD_INNER,
        padding: `${CARD_PAD_Y}px ${CARD_PAD_X}px`,
        borderRadius: 18,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        marginTop: index === 0 ? 0 : 16,
      },
      [
        box({ fontSize: 28, fontWeight: 700, color: '#ffffff' }, [section.title]),
        ...section.bullets.map((bullet) =>
          box({ marginTop: 10, alignItems: 'flex-start' }, [
            box({ width: 8, height: 8, borderRadius: 4, background: '#7c6cff', marginTop: 10, marginRight: 20 }),
            box({ width: BULLET_TEXT_WIDTH, fontSize: 23, lineHeight: 1.4, color: '#e7e4f5' }, [bullet]),
          ]),
        ),
      ],
    );

  const tree = box({ width: WIDTH, height, background: BACKGROUND, fontFamily: SANS, color: '#ffffff' }, [
    box({ flexDirection: 'column', width: INNER, height: height - PAD * 2, padding: PAD }, [
      box({
        background: ACCENT,
        borderRadius: 999,
        padding: '8px 22px',
        fontSize: 20,
        fontWeight: 700,
        alignSelf: 'flex-start',
      }, ['ПРАВИЛА']),
      box({ fontSize: 52, fontWeight: 700, marginTop: 14, lineHeight: 1.1 }, [title]),
      box({ width: 180, height: 4, background: ACCENT, borderRadius: 2, marginTop: 12, marginBottom: 30 }),
      ...sections.map(sectionCard),
    ]),
  ]);

  const svg = await satori(tree, { width: WIDTH, height, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
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
