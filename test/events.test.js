import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBanner, renderGrid } from '../src/banner.js';
import { EVENT_COMMAND, moscowWeekday, parseMoscowStart, renderEvent, renderLists } from '../src/events.js';
import { EVENT_EMOJI } from '../src/events-emoji.js';

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

test('команда /event принимает необязательную клетку карты grid', () => {
  const grid = EVENT_COMMAND.options.find((o) => o.name === 'grid');
  assert.ok(grid);
  assert.equal(grid.required, false);
});

const event = {
  id: 7,
  data: {
    title: 'Я',
    date: '12.12.2026',
    time: '12:00',
    weekday: 'суббота',
    connect: 'connect 12.324.2412.532:67',
    startsUnix: 1765530000,
  },
};

const rowsOf = (message) => message.components.map((row) => row.toJSON());

test('кнопки: четыре в одном ряду с короткими подписями и счётчиками', () => {
  const rows = rowsOf(renderEvent(event, { going: 1, late: 0, no: 0, pending: 3 }));

  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0].components.map((b) => b.label),
    ['Буду · 1', 'Опаздываю · 0', 'Не буду · 0', 'Не ответили · 3'],
  );
  assert.equal(rows[0].components[0].custom_id, 'event:rsvp:7:going');
  assert.equal(rows[0].components[3].custom_id, 'event:check:7');
});

test('без роли кнопка проверки без счётчика', () => {
  const rows = rowsOf(renderEvent(event, { going: 0, late: 0, no: 0, pending: null }));
  assert.equal(rows[0].components[3].label, 'Проверка');
});

test('с баннером embed без заголовка, картинка подключается по имени файла', () => {
  const embed = renderEvent(event, { going: 0, late: 0, no: 0, pending: null }, { bannerName: 'event.png' })
    .embeds[0]
    .toJSON();
  assert.equal(embed.title, undefined);
  assert.equal(embed.image.url, 'attachment://event.png');
});

test('квадрат карты выводится миниатюрой, кастомный эмодзи попадает в кнопку', () => {
  const message = renderEvent(
    event,
    { going: 0, late: 0, no: 0, pending: null },
    { gridName: 'grid.png', emoji: { going: { id: '123', name: 'event_going' } } },
  );
  assert.equal(message.embeds[0].toJSON().thumbnail.url, 'attachment://grid.png');
  assert.deepEqual(rowsOf(message)[0].components[0].emoji, { id: '123', name: 'event_going' });
});

test('без баннера embed с названием, строкой начала и блоком подключения, без пароля', () => {
  const embed = renderEvent(event, { going: 0, late: 0, no: 0, pending: null }).embeds[0].toJSON();
  assert.equal(embed.title, 'Я');
  assert.match(embed.description, /\*\*Начало:\*\* <t:1765530000:F> \(<t:1765530000:R>\)/);
  const fields = Object.fromEntries(embed.fields.map((f) => [f.name, f.value]));
  assert.match(fields['📋 Данные для копирования'], /\*\*Сервер:\*\* Я/);
  assert.match(fields['📋 Данные для копирования'], /12\.12\.2026 12:00 МСК/);
  assert.match(fields['Подключение'], /connect 12\.324\.2412\.532:67/);
  assert.equal(fields['Пароль'], undefined);
});

test('эмодзи для кнопок подготовлены: по одной картинке на каждый ключ', () => {
  for (const name of Object.keys(EVENT_EMOJI)) {
    assert.match(name, /^[a-z0-9_]{2,32}$/);
  }
});

test('окно модерации: четыре группы, напоминание только если кто-то не ответил', () => {
  const rsvps = [
    { user_id: '11', status: 'going' },
    { user_id: '12', status: 'late' },
    { user_id: '13', status: 'no' },
  ];
  const withPending = renderLists(event, rsvps, [{ id: '21' }, { id: '22' }]);
  const embed = withPending.embeds[0].toJSON();
  assert.equal(embed.fields.length, 4);
  assert.equal(embed.fields[0].name, '✅ Буду · 1');
  assert.equal(embed.fields[3].name, '❔ Не ответили · 2');
  assert.equal(embed.fields[3].value, '<@21> <@22>');
  assert.equal(withPending.components.length, 1);

  const allAnswered = renderLists(event, rsvps, []);
  assert.equal(allAnswered.components.length, 0);
});

test('длинный список участников сокращается, с подсказкой «и ещё N»', () => {
  const pending = Array.from({ length: 300 }, (_, i) => ({ id: String(100000000000000000n + BigInt(i)) }));
  const embed = renderLists(event, [], pending).embeds[0].toJSON();
  const value = embed.fields[3].value;
  assert.ok(value.length <= 1024);
  assert.match(value, /и ещё \d+$/);
});

test('баннер и квадрат карты рендерятся в PNG', async () => {
  const banner = await renderBanner(event.data);
  const grid = await renderGrid('G12');
  for (const png of [banner, grid]) {
    assert.equal(png.subarray(0, 4).toString('hex'), '89504e47');
    assert.ok(png.length > 5_000);
  }
});
