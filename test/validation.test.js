import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findType, validateAnswers } from '../src/form.js';

const clan = findType('clan');
const caller = findType('caller');
const media = findType('media');
const moderator = findType('moderator');

const answersFrom = (type, values) =>
  type.fields.map((field) => ({ id: field.id, label: field.label, value: values[field.id] ?? '' }));

const problemLabels = (type, values) => validateAnswers(answersFrom(type, values), type).map((p) => p.label);

test('анкета клана из одних единиц отклоняется (как в скриншоте)', () => {
  const values = { name: '1', hours: '1', age: '1', daily_online: '1', goal: '1', about: '1' };
  const labels = problemLabels(clan, values);
  assert.ok(labels.includes('Сколько вам лет?'));
  assert.ok(labels.includes('Цель посещения клана?'));
  assert.ok(labels.includes('Расскажите о себе. (статы вашего пк и тд)'));
});

test('нормальные ответы клана из реальных заявок проходят', () => {
  const values = {
    name: 'Иван',
    hours: '4к в общем',
    age: '16 годиков',
    daily_online: '6+',
    goal: 'Попробовать себя не в соло игре',
    about: 'Ртх 4060 16 ОЗУ проц не помню, веселый тип даю импакты в клан помогаю развить',
    steam: '76561198000000000',
    telegram: '@ivan_gamer',
  };
  assert.deepEqual(validateAnswers(answersFrom(clan, values), clan), []);
});

test('имя обязательно и должно быть не короче 2 символов', () => {
  assert.ok(problemLabels(clan, { name: '' }).includes('Ваше имя'));
  assert.ok(problemLabels(clan, { name: 'А' }).includes('Ваше имя'));
  assert.equal(problemLabels(clan, { name: 'Иван' }).includes('Ваше имя'), false);
});

test('короткий средний онлайн вроде «8» не блокируется', () => {
  assert.equal(problemLabels(clan, { daily_online: '8' }).includes('Ваш суточный средний онлайн?'), false);
  assert.equal(problemLabels(clan, { hours: '4' }).includes('Сколько у вас часов?'), false);
});

test('возраст клана вне диапазона 10–90 отклоняется', () => {
  assert.ok(problemLabels(clan, { age: '5' }).includes('Сколько вам лет?'));
  assert.ok(problemLabels(clan, { age: '120' }).includes('Сколько вам лет?'));
});

test('коллер младше 16 лет отклоняется, 16 и больше проходит', () => {
  assert.ok(problemLabels(caller, { name: 'Иван', age: '15', hours: '100' }).includes('Сколько вам лет?'));
  assert.equal(problemLabels(caller, { name: 'Иван', age: '16', hours: '100' }).length, 0);
});

test('медиа без ссылки на канал отклоняется, со ссылкой проходит', () => {
  const base = { name: 'Иван', content: 'стримы и нарезки по игре' };
  assert.ok(problemLabels(media, { ...base, channel: 'мой канал' }).includes('Ссылка на ваш канал'));
  assert.equal(problemLabels(media, { ...base, channel: 'youtube.com/@mychannel' }).length, 0);
});

test('вторая ссылка у медиа необязательна, но если заполнена, должна быть ссылкой', () => {
  const base = { name: 'Иван', channel: 'https://twitch.tv/x', content: 'стримы и нарезки по игре' };
  assert.equal(problemLabels(media, { ...base, extra_link: '' }).length, 0);
  assert.ok(problemLabels(media, { ...base, extra_link: 'просто текст' }).includes('Вторая ссылка (необязательно)'));
});

test('клан: Steam принимает 17 цифр, ссылку на профиль или ник, Telegram — @username или t.me', () => {
  const values = (steam, telegram) => ({
    name: 'Иван',
    hours: '100',
    age: '18',
    daily_online: '4',
    goal: 'Играть в клане и помогать',
    about: 'Пк рыжий с видеокартой, играю давно',
    steam,
    telegram,
  });
  const clanSteamProblem = (steam, telegram = '@ivan_gamer') =>
    problemLabels(clan, values(steam, telegram)).includes('Steam ID или ссылка на профиль');
  const clanTelegramProblem = (telegram) =>
    problemLabels(clan, values('76561198000000000', telegram)).includes('Telegram');

  assert.equal(clanSteamProblem('76561198000000000'), false);
  assert.equal(clanSteamProblem('https://steamcommunity.com/id/ivan'), false);
  assert.equal(clanSteamProblem('ivan_gamer'), false);
  assert.equal(clanSteamProblem('!!'), true);

  assert.equal(clanTelegramProblem('@ivan_gamer'), false);
  assert.equal(clanTelegramProblem('t.me/ivan_gamer'), false);
  assert.equal(clanTelegramProblem('@a'), true);
});

test('модератор с одними единицами отклоняется по опыту и мотивации', () => {
  const labels = problemLabels(moderator, { name: 'Иван', age: '20', hours: '500', mod_experience: '1', why: '1' });
  assert.ok(labels.includes('Опыт модерации (где и сколько)'));
  assert.ok(labels.includes('Почему хотите стать модератором?'));
});
