import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFormModal, FORM_MODAL_PREFIX, loadTicketConfig, ticketTypes } from '../src/form.js';

const panels = { main: { title: 'Тест', description: 'Тест' } };

const writeConfig = (types) => {
  const path = join(mkdtempSync(join(tmpdir(), 'tickets-')), 'tickets.json');
  writeFileSync(path, JSON.stringify({ panels, types }));
  return pathToFileURL(path);
};

const typeWith = (fields, overrides = {}) => ({
  id: 'test',
  panel: 'main',
  name: 'Тест',
  button: 'Тест',
  channelPrefix: 'тест',
  title: 'Тест',
  nextStep: 'тест',
  fields,
  ...overrides,
});

const field = (id, label = `Вопрос ${id}`) => ({ id, label, style: 'short' });

test('все типы из config/tickets.json собираются в модалку Discord', () => {
  assert.ok(ticketTypes.length >= 4);
  for (const type of ticketTypes) {
    const json = buildFormModal(type).toJSON();

    assert.equal(json.custom_id, `${FORM_MODAL_PREFIX}${type.id}`);
    assert.equal(json.components.length, type.fields.length);
    assert.deepEqual(
      json.components.map((row) => row.components[0].custom_id),
      type.fields.map((f) => f.id),
    );
  }
});

test('модалка не может быть больше 5 полей', () => {
  const fields = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => field(id));
  assert.throws(() => loadTicketConfig(writeConfig([typeWith(fields)])), /не больше 5/);
});

test('подпись поля длиннее 45 символов отклоняется', () => {
  const fields = [field('a', 'я'.repeat(46))];
  assert.throws(() => loadTicketConfig(writeConfig([typeWith(fields)])), /45 символов/);
});

test('повторяющийся id поля отклоняется', () => {
  assert.throws(
    () => loadTicketConfig(writeConfig([typeWith([field('a', 'Один'), field('a', 'Два')])])),
    /повторяется id поля/,
  );
});

test('тип без существующей панели отклоняется', () => {
  assert.throws(
    () => loadTicketConfig(writeConfig([typeWith([field('a')], { panel: 'нет' })])),
    /нет панели/,
  );
});
