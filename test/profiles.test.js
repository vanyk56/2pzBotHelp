import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProfileAnswers,
  formatSteam,
  formatTelegram,
  parseProfilesPageId,
  PROFILES_COMMAND,
  PROFILES_PAGE_PREFIX,
  renderProfilesMessage,
} from '../src/profiles.js';

test('команда /profiles имеет корректное имя и описание', () => {
  assert.equal(PROFILES_COMMAND.name, 'profiles');
  assert.ok(PROFILES_COMMAND.description);
});

test('formatSteam корректно форматирует 17-значный Steam ID, ссылки и ники', () => {
  assert.equal(
    formatSteam('76561198012345678'),
    '[76561198012345678](https://steamcommunity.com/profiles/76561198012345678)',
  );
  assert.equal(
    formatSteam('https://steamcommunity.com/profiles/76561198012345678'),
    '[76561198012345678](https://steamcommunity.com/profiles/76561198012345678)',
  );
  assert.equal(
    formatSteam('https://steamcommunity.com/id/custom_nick/'),
    '[custom_nick](https://steamcommunity.com/id/custom_nick)',
  );
  assert.equal(
    formatSteam('custom_nick'),
    '[custom_nick](https://steamcommunity.com/id/custom_nick)',
  );
  assert.equal(formatSteam(''), '*не указан*');
  assert.equal(formatSteam(null), '*не указан*');
});

test('formatTelegram корректно форматирует @username, ссылки t.me и юзернеймы без @', () => {
  assert.equal(formatTelegram('@durov'), '[@durov](https://t.me/durov)');
  assert.equal(formatTelegram('durov'), '[@durov](https://t.me/durov)');
  assert.equal(formatTelegram('https://t.me/durov'), '[@durov](https://t.me/durov)');
  assert.equal(formatTelegram('t.me/durov'), '[@durov](https://t.me/durov)');
  assert.equal(formatTelegram(''), '*не указан*');
  assert.equal(formatTelegram(null), '*не указан*');
});

test('extractProfileAnswers извлекает steam и telegram из массива ответов', () => {
  const answers = [
    { id: 'hours', value: '1500' },
    { id: 'steam', value: '76561198012345678' },
    { id: 'telegram', value: '@testuser' },
  ];
  assert.deepEqual(extractProfileAnswers(answers), {
    steam: '76561198012345678',
    telegram: '@testuser',
  });

  assert.deepEqual(extractProfileAnswers([]), { steam: null, telegram: null });
  assert.deepEqual(extractProfileAnswers(null), { steam: null, telegram: null });
});

test('parseProfilesPageId извлекает номер страницы из customId', () => {
  assert.equal(parseProfilesPageId(`${PROFILES_PAGE_PREFIX}2`), 2);
  assert.equal(parseProfilesPageId(`${PROFILES_PAGE_PREFIX}0`), 0);
  assert.equal(parseProfilesPageId('invalid'), 0);
});

test('renderProfilesMessage для пустого списка возвращает сообщение об отсутствии игроков', () => {
  const result = renderProfilesMessage([], 0, '2pz');
  const embed = result.embeds[0].toJSON();
  assert.equal(embed.title, '👥 Принятые игроки · 2pz');
  assert.equal(embed.description, 'В базе данных пока нет сохранённых игроков.');
  assert.equal(result.components.length, 0);
});

test('renderProfilesMessage с игроками строит поля и кнопки пагинации', () => {
  const sampleProfiles = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    guild_id: '123',
    user_id: `user_${i + 1}`,
    username: `Player_${i + 1}`,
    steam: '76561198000000000',
    telegram: `@player_${i + 1}`,
    created_at: new Date('2026-10-18T12:00:00Z').toISOString(),
  }));

  // Первая страница (0)
  const page0 = renderProfilesMessage(sampleProfiles, 0, '2pz');
  const embed0 = page0.embeds[0].toJSON();
  assert.equal(embed0.fields.length, 5);
  assert.ok(embed0.footer.text.includes('Страница 1 из 3 · Всего игроков: 12'));

  const row0 = page0.components[0].toJSON();
  assert.equal(row0.components.length, 3); // Назад, Вперёд, Обновить
  assert.equal(row0.components[0].disabled, true); // Кнопка «Назад» отключена на первой странице
  assert.equal(row0.components[1].disabled, false); // Кнопка «Вперёд» включена

  // Последняя страница (2)
  const page2 = renderProfilesMessage(sampleProfiles, 2, '2pz');
  const embed2 = page2.embeds[0].toJSON();
  assert.equal(embed2.fields.length, 2); // 12 - 10 = 2 игрока
  const row2 = page2.components[0].toJSON();
  assert.equal(row2.components[0].disabled, false); // Кнопка «Назад» активна
  assert.equal(row2.components[1].disabled, true); // Кнопка «Вперёд» отключена на последней странице
});
