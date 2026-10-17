import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadServers } from '../src/servers.js';

const writeServers = (servers) => {
  const path = join(mkdtempSync(join(tmpdir(), 'servers-')), 'servers.json');
  writeFileSync(path, JSON.stringify({ servers }));
  return pathToFileURL(path);
};

const validServer = (overrides = {}) => ({
  name: 'Тест',
  guildId: '1424466632511852654',
  panelChannelId: '1424466632511852655',
  panelKey: 'main',
  types: ['clan'],
  ticketCategoryId: '1424466632511852656',
  staffRoleIds: ['1559166190600060978'],
  voiceChannelId: null,
  ...overrides,
});

test('корректный сервер загружается с нормализованными ID', () => {
  const [server] = loadServers(writeServers([validServer()]));
  assert.equal(server.guildId, '1424466632511852654');
  assert.deepEqual(server.types, ['clan']);
  assert.equal(server.voiceChannelId, null);
});

test('незаполненный REPLACE-плейсхолдер не даёт запуститься', () => {
  assert.throws(
    () => loadServers(writeServers([validServer({ guildId: 'REPLACE_GUILD_ID' })])),
    /укажите ID в поле guildId/,
  );
});

test('сервер без ролей модерации отклоняется', () => {
  assert.throws(() => loadServers(writeServers([validServer({ staffRoleIds: [] })])), /роли модерации/);
});

test('неизвестный тип и панель отклоняются', () => {
  assert.throws(() => loadServers(writeServers([validServer({ types: ['нет'] })])), /нет типа тикета/);
  assert.throws(() => loadServers(writeServers([validServer({ panelKey: 'нет' })])), /нет панели/);
});

test('один и тот же сервер нельзя указать дважды', () => {
  assert.throws(
    () => loadServers(writeServers([validServer(), validServer({ name: 'Копия' })])),
    /указан дважды/,
  );
});
