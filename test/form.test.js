import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildFormModal,
  FORM_MODAL_PREFIX,
  formStepCount,
  formStepFields,
  loadTicketConfig,
  ticketTypes,
} from '../src/form.js';

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

test('все окна всех типов из config/tickets.json собираются в модалку Discord', () => {
  assert.ok(ticketTypes.length >= 4);
  for (const type of ticketTypes) {
    for (let step = 0; step < formStepCount(type); step += 1) {
      const json = buildFormModal(type, step).toJSON();
      const fields = formStepFields(type, step);

      assert.equal(json.custom_id, `${FORM_MODAL_PREFIX}${type.id}:${step}`);
      assert.equal(json.components.length, fields.length);
      assert.deepEqual(
        json.components.map((row) => row.components[0].custom_id),
        fields.map((f) => f.id),
      );
    }
  }
});

test('анкета не может быть больше двух окон по 5 полей', () => {
  const fields = 'abcdefghijk'.split('').map((id) => field(id));
  assert.throws(() => loadTicketConfig(writeConfig([typeWith(fields)])), /не больше 10/);
});

test('анкета на 7 полей делится на два окна: 5 и 2', () => {
  const fields = 'abcdefg'.split('').map((id) => field(id));
  const type = loadTicketConfig(writeConfig([typeWith(fields)])).types[0];
  assert.equal(formStepCount(type), 2);
  assert.deepEqual(formStepFields(type, 1).map((f) => f.id), ['f', 'g']);
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

