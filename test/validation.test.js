import { test } from 'node:test';
import assert from 'node:assert/strict';
import { form, validateAnswers } from '../src/form.js';

const answersFrom = (values) =>
  form.fields.map((field) => ({ id: field.id, label: field.label, value: values[field.id] ?? '' }));

const problemFields = (values) => validateAnswers(answersFrom(values)).map((p) => p.label);

test('анкета из одних единиц отклоняется целиком (как в скриншоте)', () => {
  const values = { hours: '1', age: '1', daily_online: '1', goal: '1', about: '1' };
  assert.equal(problemFields(values).length, form.fields.length);
});

test('нормальные ответы из реальных заявок проходят', () => {
  const values = {
    hours: '4к в общем',
    age: '16 годиков',
    daily_online: '6+',
    goal: 'Попробовать себя не в соло игре',
    about: 'Ртх 4060 16 ОЗУ проц не помню, веселый тип даю импакты в клан помогаю развить',
  };
  assert.deepEqual(validateAnswers(answersFrom(values)), []);
});

test('возраст вне диапазона 10–90 отклоняется', () => {
  assert.deepEqual(problemFields({ age: '5' }).filter((l) => l === 'Сколько вам лет?'), ['Сколько вам лет?']);
  assert.deepEqual(problemFields({ age: '120' }).filter((l) => l === 'Сколько вам лет?'), ['Сколько вам лет?']);
});

test('часы и онлайн без цифр отклоняются', () => {
  assert.ok(problemFields({ hours: 'много' }).includes('Сколько у вас часов?'));
  assert.ok(problemFields({ daily_online: 'ну так' }).includes('Ваш суточный средний онлайн?'));
});

test('развёрнутые поля требуют слов, а не цифр', () => {
  assert.ok(problemFields({ goal: '11111111111' }).includes('Цель посещения клана?'));
  assert.ok(problemFields({ about: '123 456 789 000 111' }).includes('Расскажите о себе. (статы вашего пк и тд)'));
});
