import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moscowWeekday, parseMoscowStart, renderEvent } from '../src/events.js';

test('дата и время по МСК переводятся в UTC (МСК = UTC+3)', () => {
  assert.equal(parseMoscowStart('12.12.2026', '12:00').toISOString(), '2026-12-12T09:00:00.000Z');
  assert.equal(parseMoscowStart('1.1.2027', '0:30').toISOString(), '2026-12-31T21:30:00.000Z');
});

test('неверный формат и несуществующая дата отклоняются', () => {
  assert.throws(() => parseMoscowStart('12-12-2026', '12:00'), /формате 12\.12\.2026/);
  assert.throws(() => parseMoscowStart('12.12.2026', '12:61'), /не существует/);
  assert.throws(() => parseMoscowStart('31.02.2026', '12:00'), /не существует/);
});

test('день недели считается по МСК', () => {
  // 12 декабря 2026 — суббота, как в примере
  assert.equal(moscowWeekday(parseMoscowStart('12.12.2026', '12:00')), 'суббота');
});

const event = {
  id: 7,
  data: {
    title: 'Я',
    date: '12.12.2026',
    time: '12:00',
    weekday: 'суббота',
    connect: 'connect 12.324.2412.532:67',
    password: '3041',
    startsUnix: 1765530000,
  },
};

test('сообщение сбора: блок данных, четыре кнопки с количеством ответов', () => {
  const json = renderEvent(event, { going: 1, late: 0, no: 0, pending: 3 }).components[0].toJSON();
  const labels = json.components.map((b) => b.label);

  assert.deepEqual(labels, [
    'Буду на вайпе · 1',
    'Опаздываю · 0',
    'Не буду · 0',
    'Проверка · не ответили: 3',
  ]);
  assert.equal(json.components[0].custom_id, 'event:rsvp:7:going');
  assert.equal(json.components[3].custom_id, 'event:check:7');
});

test('без роли кнопка проверки без счётчика', () => {
  const json = renderEvent(event, { going: 0, late: 0, no: 0, pending: null }).components[0].toJSON();
  assert.equal(json.components[3].label, 'Проверка');
});

test('embed содержит название, дату, время и блоки подключения и пароля', () => {
  const embed = renderEvent(event, { going: 0, late: 0, no: 0, pending: null }).embeds[0].toJSON();
  assert.equal(embed.title, 'Я');
  const fields = Object.fromEntries(embed.fields.map((f) => [f.name, f.value]));
  assert.match(fields['Подключение'], /connect 12\.324\.2412\.532:67/);
  assert.match(fields['Пароль'], /3041/);
  assert.match(fields['Старт у вас'], /<t:1765530000:F>/);
});
