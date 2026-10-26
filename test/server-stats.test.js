import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStatsNames,
  STATS_COMMAND,
  STATS_COMMANDS,
} from '../src/server-stats.js';

test('formatStatsNames корректно формирует названия категории и каналов', () => {
  const { categoryName, totalName, onlineName } = formatStatsNames(492, 34);
  assert.equal(categoryName, '📊 SERVER STATS 📊');
  assert.equal(totalName, 'MEMBERS: 492');
  assert.equal(onlineName, 'ONLINE: 34');

  const zeroStats = formatStatsNames(0, 0);
  assert.equal(zeroStats.totalName, 'MEMBERS: 0');
  assert.equal(zeroStats.onlineName, 'ONLINE: 0');
});

test('команда /stats зарегистрирована с подкомандами update и setup', () => {
  assert.equal(STATS_COMMAND.name, 'stats');
  assert.ok(STATS_COMMAND.options);

  const subNames = STATS_COMMAND.options.map((o) => o.name);
  assert.ok(subNames.includes('update'));
  assert.ok(subNames.includes('setup'));
  assert.ok(STATS_COMMANDS.includes(STATS_COMMAND));
});
