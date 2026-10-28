import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWarnChannel, getWarnRole, WARN_COMMANDS } from '../src/warns.js';

test('WARN_COMMANDS содержит команды warn (без срока), unwarn, warns', () => {
  const warn = WARN_COMMANDS.find((c) => c.name === 'warn');
  const unwarn = WARN_COMMANDS.find((c) => c.name === 'unwarn');
  const warns = WARN_COMMANDS.find((c) => c.name === 'warns');

  assert.ok(warn);
  assert.ok(unwarn);
  assert.ok(warns);

  // Варны бессрочные: duration больше нет в обязательных опциях
  assert.ok(warn.options.some((o) => o.name === 'user' && o.required));
  assert.ok(warn.options.some((o) => o.name === 'reason' && o.required));
  assert.equal(warn.options.some((o) => o.name === 'duration'), false);

  assert.ok(unwarn.options.some((o) => o.name === 'warn_id' && !o.required));
  assert.ok(unwarn.options.some((o) => o.name === 'user' && !o.required));
});

test('getWarnChannel находит канал по имени или настроенному ID', async () => {
  const mockGuild = {
    channels: {
      fetch: async (id) => {
        if (id === '123') return { id: '123', name: 'custom-warns' };
        return [
          { id: '1', name: 'general', type: 0 },
          { id: '2', name: '🛑・varn', type: 0 },
        ];
      },
    },
  };

  const channelFromSetting = await getWarnChannel(mockGuild, { warnChannelId: '123' });
  assert.equal(channelFromSetting.id, '123');

  const channelFromSearch = await getWarnChannel(mockGuild, {});
  assert.equal(channelFromSearch.id, '2');
});

test('getWarnRole находит роль по имени или настроенному ID', async () => {
  const mockGuild = {
    roles: {
      cache: [
        { id: 'role_1', name: 'Игрок' },
        { id: 'role_warn', name: 'Варн' },
      ],
      fetch: async (id) => {
        if (id === 'custom_role') return { id: 'custom_role', name: 'Special Warn' };
        return mockGuild.roles.cache;
      },
    },
  };

  const roleFromSetting = await getWarnRole(mockGuild, { warnRoleId: 'custom_role' });
  assert.equal(roleFromSetting.id, 'custom_role');

  const roleFromSearch = await getWarnRole(mockGuild, {});
  assert.equal(roleFromSearch.id, 'role_warn');
});
