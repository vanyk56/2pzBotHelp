import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardHeight, cleanTitle, rulesConfig, renderRulesSet } from '../src/rules-card.js';

const size = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test('номер в названии раздела убирается: он стоит в значке', () => {
  assert.equal(cleanTitle('1. Общие правила'), 'Общие правила');
  assert.equal(cleanTitle('Уважение'), 'Уважение');
});

test('высота карточек считается по самому длинному разделу', () => {
  const short = { title: 'А', bullets: ['коротко'] };
  const long = { title: 'Б', bullets: ['д'.repeat(300)] };
  assert.ok(cardHeight([short, long]) > cardHeight([short]));
  assert.equal(cardHeight([short, long]), cardHeight([long, short]));
});

for (const key of ['public', 'private']) {
  test(`набор «${key}»: заголовок и все карточки одного размера, в одном сообщении помещается до 10`, async () => {
    const images = await renderRulesSet(key, rulesConfig[key]);
    assert.equal(images.length, rulesConfig[key].sections.length + 1);

    const [first] = images.map(({ png }) => size(png));
    for (const { png, name } of images) {
      assert.equal(png.subarray(0, 4).toString('hex'), '89504e47', name);
      assert.deepEqual(size(png), first, `${name} отличается по размеру`);
    }
    assert.equal(new Set(images.map((i) => i.name)).size, images.length, 'имена файлов уникальны');
  });
}
