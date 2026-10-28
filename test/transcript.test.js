import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscriptAttachment, generateHtmlTranscript } from '../src/transcript.js';

test('generateHtmlTranscript генерирует валидный HTML документ с заголовком и сообщениями', () => {
  const ticket = {
    id: 101,
    username: 'test_player',
    user_id: '123456789',
    ticket_type: 'clan',
  };

  const messages = [
    {
      author: { username: 'test_player', bot: false },
      content: 'Привет! Хочу вступить в клан. **3000 часов**, опыт большой.',
      createdAt: new Date('2026-10-28T01:00:00Z'),
      attachments: new Map(),
      embeds: [],
    },
    {
      author: { username: '2pzbot', bot: true },
      content: 'Здравствуйте! Ваша заявка принята на рассмотрение.',
      createdAt: new Date('2026-10-28T01:01:00Z'),
      attachments: new Map(),
      embeds: [
        {
          title: 'Статус заявки',
          description: 'Ожидайте ответа модератора',
          hexColor: '#5865f2',
          fields: [{ name: 'Сервер', value: '2pz Main', inline: true }],
        },
      ],
    },
  ];

  const html = generateHtmlTranscript({
    ticket,
    type: { name: 'Заявка в клан' },
    guild: { name: '2pz Clan' },
    closedBy: 'admin',
    messages,
  });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Транскрипт тикета #101'));
  assert.ok(html.includes('test_player'));
  assert.ok(html.includes('2pzbot'));
  assert.ok(html.includes('<strong>3000 часов</strong>'));
  assert.ok(html.includes('БОТ'));
  assert.ok(html.includes('Статус заявки'));
});

test('buildTranscriptAttachment создает корректный AttachmentBuilder с именем файла', () => {
  const ticket = {
    id: 42,
    username: 'Иван_Rust',
  };

  const attachment = buildTranscriptAttachment({
    ticket,
    messages: [],
  });

  assert.ok(attachment);
  assert.ok(attachment.name.includes('42'));
  assert.ok(attachment.name.endsWith('.html'));
});
