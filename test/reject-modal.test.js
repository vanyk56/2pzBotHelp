import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReasonModal, REASON_MODAL_ID } from '../src/tickets.js';

test('модалка причины отказа: одно обязательное многострочное поле', () => {
  const json = buildReasonModal().toJSON();

  assert.equal(json.custom_id, REASON_MODAL_ID);
  assert.equal(json.components.length, 1);
  const input = json.components[0].components[0];
  assert.equal(input.custom_id, 'reason');
  assert.equal(input.required, true);
  assert.equal(input.style, 2);
});
