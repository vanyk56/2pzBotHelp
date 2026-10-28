import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ensureTicketEmojis } from '../src/tickets.js';
import { ticketConfig } from '../src/form.js';
import { buildIdeasPanelPayload } from '../src/ideas.js';

test('ensureTicketEmojis экспортируется и является функцией', () => {
  assert.equal(typeof ensureTicketEmojis, 'function');
});

test('assets/emoji содержит все 7 3D иконок высокого разрешения', () => {
  const expected = [
    '2pz_caller.png',
    '2pz_media.png',
    '2pz_mod.png',
    '2pz_warn.png',
    '2pz_report.png',
    '2pz_clan.png',
    '2pz_idea.png',
  ];

  for (const file of expected) {
    const fullPath = path.join('assets', 'emoji', file);
    assert.ok(fs.existsSync(fullPath), `Файл ${file} должен существовать`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 1000, `Файл ${file} должен быть валидным PNG (>1KB)`);
  }
});

test('config/tickets.json содержит customEmoji для всех типов тикетов', () => {
  const types = ticketConfig.types;
  assert.ok(types.length >= 6);

  for (const t of types) {
    assert.ok(t.customEmoji, `Тип ${t.id} должен содержать customEmoji`);
    assert.ok(t.customEmoji.startsWith('2pz_'));
  }
});

test('buildIdeasPanelPayload подставляет кастомный эмодзи при наличии на сервере', () => {
  const fakeGuild = {
    emojis: {
      cache: [
        { id: '111222333444555666', name: '2pz_idea' },
      ],
    },
  };

  const payload = buildIdeasPanelPayload(fakeGuild);
  const btn = payload.components[0].toJSON().components[0];
  assert.equal(btn.emoji.id, '111222333444555666');
});
