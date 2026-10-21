import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTicketLogEmbed,
  buildTicketLogPayload,
  extractTicketDetails,
  LOG_COLORS,
} from '../src/ticket-logs.js';

test('extractTicketDetails извлекает имя, часы, steam, telegram, возраст и онлайн', () => {
  const answers = [
    { id: 'name', label: 'Ваше имя', value: 'Даниил' },
    { id: 'hours', label: 'Сколько у вас часов?', value: '2500' },
    { id: 'age', label: 'Сколько вам лет?', value: '18' },
    { id: 'daily_online', label: 'Ваш суточный средний онлайн?', value: '6-8 часов' },
    { id: 'goal', label: 'Цель посещения клана?', value: 'Играть турниры' },
    { id: 'steam', label: 'Steam ID или ссылка на профиль', value: '76561198012345678' },
    { id: 'telegram', label: 'Telegram', value: '@daniil_pro' },
  ];

  const details = extractTicketDetails(answers);
  assert.equal(details.name, 'Даниил');
  assert.equal(details.hours, '2500');
  assert.equal(details.age, '18');
  assert.equal(details.dailyOnline, '6-8 часов');
  assert.equal(details.steam, '76561198012345678');
  assert.equal(details.telegram, '@daniil_pro');
  assert.equal(details.extraAnswers.length, 1);
  assert.equal(details.extraAnswers[0].id, 'goal');
});

test('extractTicketDetails корректно работает с JSON строкой и пустыми данными', () => {
  assert.deepEqual(extractTicketDetails([]), {
    name: null,
    hours: null,
    steam: null,
    telegram: null,
    age: null,
    dailyOnline: null,
    extraAnswers: [],
  });

  const jsonStr = JSON.stringify([{ id: 'name', value: 'Алексей' }]);
  const parsed = extractTicketDetails(jsonStr);
  assert.equal(parsed.name, 'Алексей');
});

test('buildTicketLogEmbed формирует правильный embed для создания тикета', () => {
  const ticket = {
    id: 42,
    user_id: '123456789012345678',
    username: 'test_player',
    channel_id: '987654321098765432',
  };
  const answers = [
    { id: 'name', label: 'Ваше имя', value: 'Иван' },
    { id: 'hours', label: 'Сколько у вас часов?', value: '3000' },
    { id: 'steam', label: 'Steam ID', value: '76561198000000000' },
    { id: 'telegram', label: 'Telegram', value: '@ivan_tg' },
  ];

  const embed = buildTicketLogEmbed({
    action: 'created',
    ticket,
    type: { name: 'Заявка в клан 2pz' },
    answers,
  }).toJSON();

  assert.equal(embed.color, LOG_COLORS.created);
  assert.equal(embed.title, '🎫 Новый тикет: Заявка в клан 2pz');
  assert.ok(embed.footer.text.includes('#42'));

  const fields = embed.fields;
  assert.ok(fields.some((f) => f.name === '📝 Имя' && f.value === 'Иван'));
  assert.ok(fields.some((f) => f.name === '⏱️ Часы' && f.value === '3000'));
  assert.ok(fields.some((f) => f.name === '🎮 Steam' && f.value.includes('76561198000000000')));
  assert.ok(fields.some((f) => f.name === '✈️ Telegram' && f.value.includes('ivan_tg')));
  assert.ok(fields.some((f) => f.name === '🧵 Ветка тикета' && f.value.includes('987654321098765432')));
});

test('buildTicketLogEmbed формирует правильный embed для принятия и отказа', () => {
  const ticket = {
    id: 10,
    user_id: '111',
    username: 'accepted_player',
    channel_id: '222',
  };
  const answers = [{ id: 'name', value: 'Олег' }, { id: 'hours', value: '1500' }];

  // Принят
  const acceptedEmbed = buildTicketLogEmbed({
    action: 'accepted',
    ticket,
    type: { name: 'Клан' },
    answers,
    decidedBy: '999',
    roleNote: 'Роль выдана',
  }).toJSON();
  assert.equal(acceptedEmbed.color, LOG_COLORS.accepted);
  assert.ok(acceptedEmbed.fields.some((f) => f.name === '🛡️ Принял' && f.value === '<@999>'));
  assert.ok(acceptedEmbed.fields.some((f) => f.name === '🏷️ Роль' && f.value === 'Роль выдана'));

  // Отклонён
  const rejectedEmbed = buildTicketLogEmbed({
    action: 'rejected',
    ticket,
    type: { name: 'Клан' },
    answers,
    decidedBy: '999',
    reason: 'Мало часов в игре',
  }).toJSON();
  assert.equal(rejectedEmbed.color, LOG_COLORS.rejected);
  assert.ok(rejectedEmbed.fields.some((f) => f.name === '🛡️ Отклонил' && f.value === '<@999>'));
  assert.ok(rejectedEmbed.fields.some((f) => f.name === '💬 Причина отказа' && f.value === 'Мало часов в игре'));
});

test('buildTicketLogPayload добавляет кнопку-ссылку на ветку', () => {
  const payload = buildTicketLogPayload({
    action: 'created',
    ticket: { id: 1, user_id: '123', channel_id: '456' },
    type: { name: 'Клан' },
    answers: [],
    threadUrl: 'https://discord.com/channels/123/456',
  });

  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components.length, 1);
  const btn = payload.components[0].toJSON().components[0];
  assert.equal(btn.url, 'https://discord.com/channels/123/456');
  assert.equal(btn.label, 'Перейти к тикету');
});
