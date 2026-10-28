import { EmbedBuilder } from 'discord.js';

const STEAM_ID64_REGEX = /^\d{17}$/;
const STEAM_PROFILE_REGEX = /steamcommunity\.com\/profiles\/(\d{17})/i;
const STEAM_VANITY_REGEX = /steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/i;
const RUST_APP_ID = 252490;

/**
 * Извлекает SteamID64 или vanity URL из строки (ссылка или ник)
 */
export function parseSteamInput(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();

  if (STEAM_ID64_REGEX.test(clean)) {
    return { type: 'id64', value: clean };
  }

  const profileMatch = clean.match(STEAM_PROFILE_REGEX);
  if (profileMatch) {
    return { type: 'id64', value: profileMatch[1] };
  }

  const vanityMatch = clean.match(STEAM_VANITY_REGEX);
  if (vanityMatch) {
    return { type: 'vanity', value: vanityMatch[1] };
  }

  if (/^[A-Za-z0-9_-]{3,32}$/.test(clean)) {
    return { type: 'vanity', value: clean };
  }

  return null;
}

/**
 * Получает 17-значный SteamID64, разрешая vanity URL при необходимости
 */
export async function resolveSteamId(input, apiKey, fetchFn = fetch) {
  const parsed = parseSteamInput(input);
  if (!parsed) return null;
  if (parsed.type === 'id64') return parsed.value;

  if (!apiKey) return null;

  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${encodeURIComponent(
      apiKey,
    )}&vanityurl=${encodeURIComponent(parsed.value)}`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.response?.success === 1 && data.response.steamid) {
      return data.response.steamid;
    }
    return null;
  } catch (err) {
    console.warn('Ошибка вызова Steam ResolveVanityURL:', err.message);
    return null;
  }
}

/**
 * Выполняет полную проверку Steam-аккаунта: статус, баны, дата создания, часы в Rust
 */
export async function checkSteamAccount(input, apiKey, fetchFn = fetch) {
  if (!apiKey) {
    return { enabled: false, reason: 'STEAM_API_KEY не задан' };
  }

  const steamId = await resolveSteamId(input, apiKey, fetchFn);
  if (!steamId) {
    return { enabled: true, found: false, rawInput: input };
  }

  try {
    const [summaryRes, bansRes, gamesRes] = await Promise.all([
      fetchFn(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(
          apiKey,
        )}&steamids=${encodeURIComponent(steamId)}`,
      ).catch(() => null),
      fetchFn(
        `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(
          apiKey,
        )}&steamids=${encodeURIComponent(steamId)}`,
      ).catch(() => null),
      fetchFn(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(
          apiKey,
        )}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&appids_filter[0]=${RUST_APP_ID}`,
      ).catch(() => null),
    ]);

    const summaryData = summaryRes?.ok ? await summaryRes.json() : null;
    const bansData = bansRes?.ok ? await bansRes.json() : null;
    const gamesData = gamesRes?.ok ? await gamesRes.json() : null;

    const player = summaryData?.response?.players?.[0] ?? null;
    if (!player) {
      return { enabled: true, found: false, steamId };
    }

    const bans = bansData?.players?.[0] ?? {};
    const rustGame = gamesData?.response?.games?.find((g) => g.appid === RUST_APP_ID);

    const isPublic = player.communityvisibilitystate === 3;
    const timeCreated = player.timecreated ? Number(player.timecreated) : null;
    const accountAgeDays = timeCreated
      ? Math.floor((Date.now() - timeCreated * 1000) / (24 * 60 * 60 * 1000))
      : null;

    const vacBanned = Boolean(bans.VACBanned);
    const vacBansCount = bans.NumberOfVACBans ?? 0;
    const daysSinceLastBan = bans.DaysSinceLastBan ?? 0;
    const gameBansCount = bans.NumberOfGameBans ?? 0;
    const communityBanned = Boolean(bans.CommunityBanned);

    const rustMinutes = rustGame?.playtime_forever ?? null;
    const rustHours = rustMinutes != null ? Math.round(rustMinutes / 60) : null;

    const warnings = [];
    if (!isPublic) {
      warnings.push('🔒 Профиль скрыт настройками приватности (нельзя проверить игры и инвентарь)');
    } else if (rustHours === null) {
      warnings.push('🔒 Игровая информация и часы скрыты настройками приватности');
    }
    if (vacBanned) {
      warnings.push(`🚨 Обнаружен VAC-бан (${vacBansCount} шт., последний ${daysSinceLastBan} дн. назад)`);
    }
    if (gameBansCount > 0) {
      warnings.push(`🚨 Игровые блокировки разработчиком (Game Ban: ${gameBansCount} шт.)`);
    }
    if (communityBanned) {
      warnings.push('🚨 Блокировка в сообществе Steam (Community Banned)');
    }
    if (accountAgeDays !== null && accountAgeDays < 30) {
      warnings.push(`⚠️ Свежий аккаунт (создан ${accountAgeDays} дн. назад)`);
    }
    if (rustHours !== null && rustHours < 100) {
      warnings.push(`⚠️ Мало часов в Rust (${rustHours} ч.)`);
    }

    return {
      enabled: true,
      found: true,
      steamId,
      personaname: player.personaname || steamId,
      profileurl: player.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
      avatar: player.avatarfull || player.avatar || null,
      isPublic,
      timeCreated,
      accountAgeDays,
      vacBanned,
      vacBansCount,
      daysSinceLastBan,
      gameBansCount,
      communityBanned,
      rustHours,
      warnings,
      isSuspicious: warnings.length > 0,
    };
  } catch (err) {
    console.error('Ошибка проверки Steam аккаунта:', err);
    return { enabled: true, error: err.message, steamId };
  }
}

/**
 * Строит Discord Embed с результатами проверки Steam
 */
export function buildSteamCheckEmbed(result) {
  if (!result || !result.enabled || !result.found) {
    return null;
  }

  const hasCriticalBans = result.vacBanned || result.gameBansCount > 0 || result.communityBanned;
  const color = hasCriticalBans ? 0xed4245 : result.isSuspicious ? 0xfee75c : 0x57f287;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎮 Steam: ${result.personaname}`)
    .setURL(result.profileurl)
    .setFooter({ text: 'Автопроверка Steam · Тикет не отклонён (информация для модераторов)' })
    .setTimestamp(new Date());

  if (result.avatar) {
    embed.setThumbnail(result.avatar);
  }

  embed.addFields(
    {
      name: '👁️ Профиль',
      value: result.isPublic ? '🔓 Открытый' : '🔒 Скрытый',
      inline: true,
    },
    {
      name: '⏱️ Часы в Rust',
      value: result.rustHours !== null ? `${result.rustHours.toLocaleString('ru-RU')} ч.` : '*Скрыты*',
      inline: true,
    },
    {
      name: '📅 Регистрация',
      value:
        result.accountAgeDays !== null
          ? `${result.accountAgeDays} дн. назад`
          : '*Скрыта*',
      inline: true,
    },
  );

  const banText = hasCriticalBans
    ? `🚨 VAC: ${result.vacBansCount} · Игра: ${result.gameBansCount} (${result.daysSinceLastBan} дн. назад)`
    : '✅ Чисто (банов нет)';

  embed.addFields({
    name: '🛡️ Блокировки',
    value: banText,
    inline: true,
  });

  if (result.warnings.length > 0) {
    embed.addFields({
      name: '⚠️ Подозрительные маркеры',
      value: result.warnings.map((w) => `• ${w}`).join('\n'),
      inline: false,
    });
  }

  return embed;
}
