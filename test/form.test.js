import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFormModal, form, FORM_MODAL_ID, loadForm } from '../src/form.js';

const writeForm = (data) => {
  const path = join(mkdtempSync(join(tmpdir(), 'form-')), 'form.json');
  writeFileSync(path, JSON.stringify(data));
  return pathToFileURL(path);
};

test('анкета из config/form.json собирается в модалку Discord', () => {
  const json = buildFormModal(form).toJSON();

  assert.equal(json.custom_id, FORM_MODAL_ID);
  assert.equal(json.components.length, form.fields.length);
  assert.deepEqual(
    json.components.map((row) => row.components[0].custom_id),
    form.fields.map((field) => field.id),
  );
});

test('модалка не может быть больше 5 полей', () => {
  const field = (id) => ({ id, label: `Вопрос ${id}`, style: 'short' });
  const data = { title: 'Тест', fields: ['a', 'b', 'c', 'd', 'e', 'f'].map(field) };

  assert.throws(() => loadForm(writeForm(data)), /не больше 5/);
});

test('подпись поля длиннее 45 символов отклоняется', () => {
  const data = { title: 'Тест', fields: [{ id: 'a', label: 'я'.repeat(46), style: 'short' }] };
  assert.throws(() => loadForm(writeForm(data)), /45 символов/);
});

test('повторяющийся id поля отклоняется', () => {
  const data = {
    title: 'Тест',
    fields: [
      { id: 'a', label: 'Один', style: 'short' },
      { id: 'a', label: 'Два', style: 'short' },
    ],
  };
  assert.throws(() => loadForm(writeForm(data)), /Повторяется id/);
});
