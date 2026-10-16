import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, splitMessage } from '../src/utils.js';

test('slugify оставляет кириллицу и латиницу, убирает лишние символы', () => {
  assert.equal(slugify('Florik Krossee!', '123'), 'florik-krossee');
  assert.equal(slugify('Иван_Петров', '123'), 'иван-петров');
});

test('slugify использует запасное имя, если ничего не осталось', () => {
  assert.equal(slugify('!!!', '42'), '42');
});

test('splitMessage не режет короткий текст', () => {
  assert.deepEqual(splitMessage('привет'), ['привет']);
});

test('splitMessage делит длинный текст на куски не длиннее лимита', () => {
  const text = Array.from({ length: 300 }, (_, i) => `строка ${i}`).join('\n');
  const chunks = splitMessage(text, 200);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 200, `кусок длиннее лимита: ${chunk.length}`);
  assert.equal(chunks.join('\n').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});
