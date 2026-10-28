import { readFileSync } from 'node:fs';
import { AttachmentBuilder } from 'discord.js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const SANS = 'DejaVu Sans';

const font = (file, weight) => ({
  name: SANS,
  data: readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)),
  weight,
  style: 'normal',
});
const fonts = [font('DejaVuSans.ttf', 400), font('DejaVuSans-Bold.ttf', 700)];

const box = (style, children = []) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

/**
 * Рендерит графическую карточку решения по тикету (отказ / принятие / закрытие)
 */
export async function renderVerdictCard({
  ticketId = 0,
  typeName = 'Тикет',
  status = 'rejected', // 'accepted' | 'rejected' | 'closed'
  reason = null,
  moderator = 'Модерация',
  guildName = '2PZ CLAN',
  messagesCount = 0,
}) {
  const isRejected = status === 'rejected';
  const isAccepted = status === 'accepted';

  const bg = isRejected
    ? 'radial-gradient(circle at 85% 25%, #991b1b 0%, #2a1215 55%, #0f0a0c 100%)'
    : isAccepted
    ? 'radial-gradient(circle at 85% 25%, #065f46 0%, #14291e 55%, #0c0d14 100%)'
    : 'radial-gradient(circle at 85% 25%, #2b32b2 0%, #141629 55%, #0c0d14 100%)';

  const borderColor = isRejected
    ? 'rgba(239, 68, 68, 0.3)'
    : isAccepted
    ? 'rgba(16, 185, 129, 0.3)'
    : 'rgba(59, 130, 246, 0.3)';

  const badgeBg = isRejected ? '#ef4444' : isAccepted ? '#10b981' : '#2563eb';
  const badgeText = isRejected ? 'РЕШЕНИЕ: ОТКЛОНЕНО' : isAccepted ? 'РЕШЕНИЕ: ПРИНЯТ' : 'ТИКЕТ ЗАКРЫТ';
  const titleText = isRejected ? 'Заявка отклонена' : isAccepted ? 'Заявка принята!' : 'Тикет закрыт';
  const dotColor = isRejected ? '#ef4444' : isAccepted ? '#10b981' : '#3b82f6';
  const topSubColor = isRejected ? '#b57b7b' : '#7a829e';

  const cleanReason = (reason || (isRejected ? 'Причина не указана' : '')).slice(0, 160);

  const WIDTH = 800;
  const HEIGHT = 480;

  const tree = box(
    {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      background: bg,
      border: `2px solid ${borderColor}`,
      borderRadius: '24px',
      padding: '40px 48px',
      flexDirection: 'column',
      color: '#ffffff',
      fontFamily: SANS,
      boxSizing: 'border-box',
      justifyContent: 'space-between',
    },
    [
      // Верхняя информационная строка
      box({ justifyContent: 'space-between', alignItems: 'center', width: '100%' }, [
        box({ fontSize: '14px', fontWeight: 700, letterSpacing: '2px', color: topSubColor, textTransform: 'uppercase' }, [
          guildName,
        ]),
        box({ fontSize: '14px', fontWeight: 700, letterSpacing: '2px', color: topSubColor, textTransform: 'uppercase' }, [
          `ТИКЕТ #${ticketId}`,
        ]),
      ]),

      // Главный блок статуса
      box({ flexDirection: 'column', marginTop: '14px' }, [
        box(
          {
            background: badgeBg,
            color: '#ffffff',
            padding: '6px 16px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            alignSelf: 'flex-start',
            marginBottom: '12px',
          },
          [badgeText],
        ),
        box({ fontSize: '38px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }, [titleText]),
        box({ fontSize: '16px', color: '#9ca3af' }, [`Категория: ${typeName}`]),
      ]),

      // Блок причины отказа или инструкций
      isRejected
        ? box(
            {
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '14px',
              padding: '16px 20px',
              flexDirection: 'column',
              margin: '10px 0',
            },
            [
              box(
                {
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#f87171',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: '4px',
                },
                ['Причина отказа:'],
              ),
              box({ fontSize: '18px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }, [cleanReason]),
            ],
          )
        : box(
            {
              background: 'rgba(0, 0, 0, 0.35)',
              border: `1px solid ${borderColor}`,
              borderRadius: '14px',
              padding: '16px 20px',
              flexDirection: 'column',
              margin: '10px 0',
            },
            [
              box(
                {
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#34d399',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: '4px',
                },
                ['Дальнейшие шаги:'],
              ),
              box({ fontSize: '17px', color: '#ffffff' }, [
                isAccepted
                  ? 'Роли выданы. Ознакомьтесь с правилами и ожидайте сбора'
                  : 'Тикет завершён. Спасибо за обращение к администрации',
              ]),
            ],
          ),

      // Список с точками-маркерами
      box({ flexDirection: 'column', gap: '8px', marginTop: '4px' }, [
        box({ alignItems: 'center' }, [
          box({ color: dotColor, fontSize: '20px', fontWeight: 700, marginRight: '10px' }, ['•']),
          box({ fontSize: '15px', color: '#d1d5db' }, [
            'Решение принял: ',
            box({ fontWeight: 700, color: '#ffffff', marginLeft: '6px' }, [`@${moderator}`]),
          ]),
        ]),
        box({ alignItems: 'center' }, [
          box({ color: dotColor, fontSize: '20px', fontWeight: 700, marginRight: '10px' }, ['•']),
          box({ fontSize: '15px', color: '#d1d5db' }, [
            isRejected
              ? 'Если у вас есть вопросы или вы улучшили показатели, вы можете подать новый тикет.'
              : 'Добро пожаловать в состав 2PZ!',
          ]),
        ]),
      ]),

      // Нижний колонтитул
      box(
        {
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '12px',
          marginTop: '8px',
        },
        [
          box({ fontSize: '12px', color: '#6b7280' }, [
            messagesCount > 0 ? `Сообщений в тикете: ${messagesCount}` : 'Официальное уведомление',
          ]),
          box({ fontSize: '12px', color: '#6b7280' }, ['2PZ Management Bot']),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

/**
 * Рендерит графическую карточку истории сообщений (переписки) тикета
 */
export async function renderDialogueCard({
  ticketId = 0,
  typeName = 'Тикет',
  guildName = '2PZ CLAN',
  messages = [],
}) {
  const WIDTH = 800;
  const HEIGHT = 540;

  const bg = 'radial-gradient(circle at 85% 25%, #2b32b2 0%, #141629 55%, #0c0d14 100%)';
  const borderColor = 'rgba(59, 130, 246, 0.25)';

  // Извлекаем и фильтруем до 5 самых содержательных сообщений
  const parsed = [];
  for (const m of messages) {
    const rawText = (m.cleanContent || m.content || '').trim();
    if (!rawText && (!m.answers || m.answers.length === 0)) continue;

    const author = m.author?.username || m.username || 'Участник';
    const isBot = Boolean(m.author?.bot || m.isBot);
    const isStaff = Boolean(m.isStaff);

    let text = rawText;
    if (!text && m.answers?.length > 0) {
      text = m.answers.map((a) => `${a.label}: ${a.value}`).join(' | ');
    }

    parsed.push({
      author,
      isBot,
      isStaff,
      text: text.slice(0, 160),
    });
  }

  const listToRender = parsed.slice(-5);
  if (listToRender.length === 0) {
    listToRender.push({
      author: 'Система',
      isBot: true,
      isStaff: false,
      text: 'В данном тикете не было дополнительных текстовых сообщений.',
    });
  }

  const renderedMessages = listToRender.map((m) => {
    const roleBadge = m.isBot ? 'БОТ' : m.isStaff ? 'МОДЕРАТОР' : 'ИГРОК';
    const badgeColor = m.isBot ? '#5865f2' : m.isStaff ? '#10b981' : '#6b7280';
    const authorColor = m.isStaff ? '#34d399' : m.isBot ? '#818cf8' : '#ffffff';

    return box(
      {
        flexDirection: 'column',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '10px 14px',
        marginBottom: '8px',
      },
      [
        box({ alignItems: 'center', marginBottom: '4px' }, [
          box({ fontWeight: 700, fontSize: '14px', color: authorColor, marginRight: '8px' }, [m.author]),
          box(
            {
              background: badgeColor,
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            },
            [roleBadge],
          ),
        ]),
        box({ fontSize: '13px', color: '#d1d5db', lineHeight: 1.3 }, [m.text]),
      ],
    );
  });

  const tree = box(
    {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      background: bg,
      border: `2px solid ${borderColor}`,
      borderRadius: '24px',
      padding: '32px 40px',
      flexDirection: 'column',
      color: '#ffffff',
      fontFamily: SANS,
      boxSizing: 'border-box',
      justifyContent: 'space-between',
    },
    [
      // Заголовок
      box({ justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px' }, [
        box({ flexDirection: 'column' }, [
          box({ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: '#7a829e', textTransform: 'uppercase' }, [
            `${guildName} • ИСТОРИЯ ДИАЛОГА`,
          ]),
          box({ fontSize: '24px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }, [
            `Переписка тикета #${ticketId}`,
          ]),
        ]),
        box(
          {
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid #3b82f6',
            color: '#93c5fd',
            padding: '6px 14px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 700,
          },
          [typeName],
        ),
      ]),

      // Список сообщений
      box({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, renderedMessages),

      // Колонтитул
      box(
        {
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '10px',
          marginTop: '8px',
        },
        [
          box({ fontSize: '12px', color: '#6b7280' }, ['Официальная копия диалога тикета']),
          box({ fontSize: '12px', color: '#6b7280' }, ['2PZ Clan Bot']),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

/**
 * Оборачивает карточку вердикта в Discord Attachment
 */
export async function buildVerdictCardAttachment(params) {
  const png = await renderVerdictCard(params);
  return new AttachmentBuilder(png, { name: 'ticket_verdict.png' });
}

/**
 * Оборачивает карточку диалога в Discord Attachment
 */
export async function buildDialogueCardAttachment(params) {
  const png = await renderDialogueCard(params);
  return new AttachmentBuilder(png, { name: 'ticket_history.png' });
}
