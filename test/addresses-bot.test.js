import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressesBot } from '../src/tickets.js';

const BOT_ID = '1396809640846557247';

test('слово «бот» как обращение к боту распознаётся', () => {
  assert.equal(addressesBot('бот', BOT_ID), true);
  assert.equal(addressesBot('ку, бот?', BOT_ID), true);
  assert.equal(addressesBot('2pzbot ответь', BOT_ID), true);
});

test('упоминание бота через @ распознаётся', () => {
  assert.equal(addressesBot(`<@${BOT_ID}> привет`, BOT_ID), true);
});

test('слова с «бот» внутри (работа, ботинки) не считаются обращением', () => {
  assert.equal(addressesBot('работа в понедельник', BOT_ID), false);
  assert.equal(addressesBot('новые ботинки', BOT_ID), false);
});

test('обычная фраза модератора к игроку не считается обращением к боту', () => {
  assert.equal(addressesBot('скоро проверим вас', BOT_ID), false);
  assert.equal(addressesBot('ку', BOT_ID), false);
});
