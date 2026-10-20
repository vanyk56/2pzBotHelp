import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStreamAlertPayload,
  extractTwitchLogin,
  STREAM_COMMAND,
  STREAM_COMMANDS,
} from '../src/streams.js';

test('команда /stream и подкоманды зарегистрированы', () => {
  assert.equal(STREAM_COMMAND.name, 'stream');
  const subs = STREAM_COMMAND.options.map((o) => o.name);
  assert.ok(subs.includes('add'));
  assert.ok(subs.includes('remove'));
  assert.ok(subs.includes('list'));
  assert.ok(subs.includes('set-channel'));
  assert.ok(subs.includes('remove-channel'));
  assert.ok(subs.includes('test'));
  assert.ok(subs.includes('check'));
});

test('extractTwitchLogin корректно разбирает ссылки, логины и @', () => {
  assert.equal(extractTwitchLogin('chotki_mops'), 'chotki_mops');
  assert.equal(extractTwitchLogin('@chotki_mops'), 'chotki_mops');
  assert.equal(extractTwitchLogin('https://www.twitch.tv/chotki_mops'), 'chotki_mops');
  assert.equal(extractTwitchLogin('twitch.tv/chotki_mops'), 'chotki_mops');
  assert.equal(extractTwitchLogin('https://twitch.tv/Shroud'), 'shroud');
  assert.equal(extractTwitchLogin(''), null);
  assert.equal(extractTwitchLogin(null), null);
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
