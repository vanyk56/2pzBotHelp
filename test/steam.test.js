import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSteamCheckEmbed,
  checkSteamAccount,
  parseSteamInput,
  resolveSteamId,
} from '../src/steam.js';

test('parseSteamInput распознает 17-значный Steam ID, ссылки на профили и ники', () => {
  assert.deepEqual(parseSteamInput('76561198012345678'), {
    type: 'id64',
    value: '76561198012345678',
  });
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/profiles/76561198012345678/'), {
    type: 'id64',
    value: '76561198012345678',
  });
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/id/gamer_pro'), {
    type: 'vanity',
    value: 'gamer_pro',
  });
  assert.deepEqual(parseSteamInput('gamer_pro'), {
    type: 'vanity',
    value: 'gamer_pro',
  });
  assert.equal(parseSteamInput(''), null);
  assert.equal(parseSteamInput(null), null);
});

test('resolveSteamId без apiKey не может разрешить vanity, но возвращает готовый ID64', async () => {
  assert.equal(await resolveSteamId('76561198012345678', null), '76561198012345678');
  assert.equal(await resolveSteamId('custom_nick', null), null);
});

test('resolveSteamId успешно вызывает ResolveVanityURL с mock fetch', async () => {
  const mockFetch = async (url) => {
    assert.ok(url.includes('ResolveVanityURL'));
    assert.ok(url.includes('vanityurl=custom_nick'));
    return {
      ok: true,
      json: async () => ({
        response: { success: 1, steamid: '76561198099999999' },
      }),
    };
  };

  const id = await resolveSteamId('custom_nick', 'FAKE_KEY', mockFetch);
  assert.equal(id, '76561198099999999');
});

test('checkSteamAccount без apiKey возвращает disabled: false', async () => {
  const res = await checkSteamAccount('76561198012345678', null);
  assert.equal(res.enabled, false);
});

test('checkSteamAccount с открытым чистым аккаунтом без банов', async () => {
  const mockFetch = async (url) => {
    if (url.includes('GetPlayerSummaries')) {
      return {
        ok: true,
        json: async () => ({
          response: {
            players: [
              {
                steamid: '76561198012345678',
                personaname: 'ProGamer',
                communityvisibilitystate: 3, // public
                timecreated: Math.floor(Date.now() / 1000) - 365 * 24 * 3600, // 1 year ago
                avatarfull: 'https://steam.com/avatar.jpg',
              },
            ],
          },
        }),
      };
    }
    if (url.includes('GetPlayerBans')) {
      return {
        ok: true,
        json: async () => ({
          players: [
            {
              SteamId: '76561198012345678',
              VACBanned: false,
              NumberOfVACBans: 0,
              NumberOfGameBans: 0,
            },
          ],
        }),
      };
    }
    if (url.includes('GetOwnedGames')) {
      return {
        ok: true,
        json: async () => ({
          response: {
            games: [
              {
                appid: 252490,
                playtime_forever: 120000, // 2000 hours
              },
            ],
          },
        }),
      };
    }
    throw new Error('Unknown url: ' + url);
  };

  const res = await checkSteamAccount('76561198012345678', 'FAKE_KEY', mockFetch);
  assert.equal(res.found, true);
  assert.equal(res.isPublic, true);
  assert.equal(res.vacBanned, false);
  assert.equal(res.rustHours, 2000);
  assert.equal(res.isSuspicious, false);
  assert.equal(res.warnings.length, 0);

  const embed = buildSteamCheckEmbed(res).toJSON();
  assert.ok(embed.title.includes('ProGamer'));
  assert.equal(embed.color, 0x57f287); // Green
});

test('checkSteamAccount со скрытым профилем и свежим VAC-баном помечается как подозрительный', async () => {
  const mockFetch = async (url) => {
    if (url.includes('GetPlayerSummaries')) {
      return {
        ok: true,
        json: async () => ({
          response: {
            players: [
              {
                steamid: '76561198012345678',
                personaname: 'SusPlayer',
                communityvisibilitystate: 1, // private
                timecreated: Math.floor(Date.now() / 1000) - 10 * 24 * 3600, // 10 days ago
              },
            ],
          },
        }),
      };
    }
    if (url.includes('GetPlayerBans')) {
      return {
        ok: true,
        json: async () => ({
          players: [
            {
              SteamId: '76561198012345678',
              VACBanned: true,
              NumberOfVACBans: 1,
              DaysSinceLastBan: 40,
              NumberOfGameBans: 0,
            },
          ],
        }),
      };
    }
    if (url.includes('GetOwnedGames')) {
      return {
        ok: true,
        json: async () => ({
          response: {},
        }),
      };
    }
  };

  const res = await checkSteamAccount('76561198012345678', 'FAKE_KEY', mockFetch);
  assert.equal(res.found, true);
  assert.equal(res.isPublic, false);
  assert.equal(res.vacBanned, true);
  assert.equal(res.isSuspicious, true);
  assert.ok(res.warnings.some((w) => w.includes('VAC-бан')));
  assert.ok(res.warnings.some((w) => w.includes('скрыт')));
  assert.ok(res.warnings.some((w) => w.includes('Свежий аккаунт')));

  const embed = buildSteamCheckEmbed(res).toJSON();
  assert.equal(embed.color, 0xed4245); // Red (has VAC ban)
  assert.ok(embed.fields.some((f) => f.name === '⚠️ Подозрительные маркеры'));
});
