import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhoisEmbed, WHOIS_COMMAND } from '../src/whois.js';

test('WHOIS_COMMAND корректно сконфигурирована', () => {
  assert.equal(WHOIS_COMMAND.name, 'whois');
  assert.ok(WHOIS_COMMAND.options.some((o) => o.name === 'user' && o.required));
});

test('buildWhoisEmbed строит информативный embed для принятого соклановца с варнами', () => {
  const targetUser = {
    id: '123456789012345678',
    username: 'best_player',
    displayAvatarURL: () => 'https://discord.com/avatar.png',
    createdAt: new Date('2022-01-01T00:00:00Z'),
  };

  const profile = {
    real_name: 'Артём',
    hours: '3000',
    steam: '76561198012345678',
    telegram: '@artem_rust',
    ticket_id: 15,
    accepted_by: '987654321',
    created_at: new Date('2023-05-10T12:00:00Z'),
  };

  const warns = [
    {
      id: 1,
      reason: 'Тимкилл на фарме',
      active: true,
      expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    },
  ];

  const tickets = [
    {
      id: 15,
      ticket_type: 'clan',
      status: 'closed',
      created_at: new Date('2023-05-10T11:00:00Z'),
    },
  ];

  const embed = buildWhoisEmbed({
    targetUser,
    member: null,
    profile,
    warns,
    tickets,
    steamCheck: { found: true, rustHours: 3200, vacBanned: false },
    guildId: '111',
  }).toJSON();

  assert.ok(embed.title.includes('best_player'));
  assert.ok(embed.description.includes('Принят в клан'));
  assert.ok(embed.fields.some((f) => f.name === '🛡️ Данные соклановца' && f.value.includes('Артём')));
  assert.ok(embed.fields.some((f) => f.name === '🎮 Steam' && f.value.includes('3200 ч.')));
  assert.ok(embed.fields.some((f) => f.name === '⚠️ Предупреждения (Варны)' && f.value.includes('1/3')));
  assert.ok(embed.fields.some((f) => f.name === '🎫 История тикетов' && f.value.includes('#15')));
});
