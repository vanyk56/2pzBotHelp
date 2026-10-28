import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDialogueCardAttachment,
  buildVerdictCardAttachment,
  renderDialogueCard,
  renderVerdictCard,
} from '../src/ticket-card.js';

test('renderVerdictCard генерирует валидный PNG для отказанного тикета', async () => {
  const png = await renderVerdictCard({
    ticketId: 101,
    typeName: 'Заявка в клан 2pz',
    status: 'rejected',
    reason: 'Недостаточно часов',
    moderator: 'Admin',
    guildName: '2PZ CLAN',
  });

  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 5000);
  // Проверяем сигнатуру PNG (89 50 4E 47)
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.equal(png[2], 0x4e);
  assert.equal(png[3], 0x47);
});

test('renderVerdictCard генерирует валидный PNG для принятого тикета', async () => {
  const png = await renderVerdictCard({
    ticketId: 102,
    typeName: 'Коллер (16+)',
    status: 'accepted',
    moderator: 'Leader',
    guildName: '2PZ CLAN',
  });

  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 5000);
});

test('renderDialogueCard генерирует валидный PNG истории сообщений тикета', async () => {
  const png = await renderDialogueCard({
    ticketId: 103,
    typeName: 'Медиа клана',
    guildName: '2PZ CLAN',
    messages: [
      { author: { username: 'streamer' }, content: 'Привет! Вот мой канал twitch.tv/streamer' },
      { author: { username: 'Mod', bot: false }, isStaff: true, content: 'Привет, онлайн стабильный?' },
      { author: { username: 'streamer' }, content: 'Да, стримлю каждый день.' },
    ],
  });

  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 5000);
});

test('buildVerdictCardAttachment и buildDialogueCardAttachment создают Discord attachments с правильными именами', async () => {
  const verdict = await buildVerdictCardAttachment({
    ticketId: 104,
    status: 'rejected',
  });
  assert.equal(verdict.name, 'ticket_verdict.png');

  const history = await buildDialogueCardAttachment({
    ticketId: 105,
    messages: [],
  });
  assert.equal(history.name, 'ticket_history.png');
});
