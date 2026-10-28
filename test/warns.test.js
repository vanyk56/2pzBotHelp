import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationDays, WARN_COMMANDS } from '../src/warns.js';

test('WARN_COMMANDS содержит корректно настроенные команды warn, unwarn, warns', () => {
  const warn = WARN_COMMANDS.find((c) => c.name === 'warn');
  const unwarn = WARN_COMMANDS.find((c) => c.name === 'unwarn');
  const warns = WARN_COMMANDS.find((c) => c.name === 'warns');

  assert.ok(warn);
  assert.ok(unwarn);
  assert.ok(warns);

  assert.ok(warn.options.some((o) => o.name === 'user' && o.required));
  assert.ok(warn.options.some((o) => o.name === 'reason' && o.required));
  assert.ok(warn.options.some((o) => o.name === 'duration' && !o.required));

  assert.ok(unwarn.options.some((o) => o.name === 'warn_id' && !o.required));
  assert.ok(unwarn.options.some((o) => o.name === 'user' && !o.required));
});

test('parseDurationDays корректно парсит дни и выставляет дефолт 7', () => {
  assert.equal(parseDurationDays('7d'), 7);
  assert.equal(parseDurationDays('14д'), 14);
  assert.equal(parseDurationDays('30 дней'), 30);
  assert.equal(parseDurationDays('3'), 3);
  assert.equal(parseDurationDays(''), 7);
  assert.equal(parseDurationDays(null), 7);
  assert.equal(parseDurationDays('abc'), 7);
  assert.equal(parseDurationDays('500'), 365); // max 365
});
