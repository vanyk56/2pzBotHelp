import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamAlertPayload, STREAM_COMMANDS } from '../src/streams.js';

test('команды стримов зарегистрированы', () => {
  const names = STREAM_COMMANDS.map((c) => c.name);
  assert.ok(names.includes('stream-check'));
  assert.ok(names.includes('stream-test'));
});

test('buildStreamAlertPayload формирует сообщение, embed и кнопку в стиле 2pz', () => {
  const stream = {
    id: '12345',
    title: '🔥 Вайп Rust на 2pz!',
    game: 'Rust',
    viewers: 50,
    createdAt: '2026-10-20T10:00:00.000Z',
  };

  const payload = buildStreamAlertPayload({
    login: 'chotki_mops',
    displayName: 'chotki_mops',
    avatar: 'https://example.com/avatar.png',
    stream,
    pingRole: null,
  });

  assert.equal(payload.content, '🔴 **chotki_mops** в эфире: https://www.twitch.tv/chotki_mops');
  assert.equal(payload.embeds.length, 1);

  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, '🔥 Вайп Rust на 2pz!');
  assert.equal(embed.url, 'https://www.twitch.tv/chotki_mops');
  assert.equal(embed.color, 0x7c6cff);
  assert.equal(embed.author.name, 'chotki_mops начал стрим!');
  assert.equal(embed.fields[0].name, '🎮 Игра');
  assert.equal(embed.fields[0].value, 'Rust');

  assert.equal(payload.components.length, 1);
  const button = payload.components[0].toJSON().components[0];
  assert.equal(button.label, 'Смотреть стрим');
  assert.equal(button.url, 'https://www.twitch.tv/chotki_mops');
});

test('buildStreamAlertPayload добавляет пинг роли, если он указан', () => {
  const stream = {
    id: '12345',
    title: 'Стрим',
    game: 'Rust',
    viewers: 10,
    createdAt: '2026-10-20T10:00:00.000Z',
  };

  const payload = buildStreamAlertPayload({
    login: 'chotki_mops',
    displayName: 'chotki_mops',
    avatar: null,
    stream,
    pingRole: '1424466632511852654',
  });

  assert.ok(payload.content.startsWith('<@&1424466632511852654> 🔴 **chotki_mops** в эфире'));
});
