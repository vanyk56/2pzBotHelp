import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

export const PROFILES_COMMAND = {
  name: 'profiles',
  description: 'Список принятых игроков (Steam ID и Telegram) и удаление профилей',
  options: [
    {
      name: 'delete_user',
      description: 'Удалить профиль выбранного игрока (оставьте пустым для просмотра списка)',
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ],
};

export const PROFILES_PAGE_PREFIX = 'profiles:page:';
export const PROFILES_PAGE_SIZE = 5;
export const PROFILES_DELETE_PROMPT = 'profiles:delete_prompt';
export const PROFILES_DO_DELETE = 'profiles:do_delete';

export function parseProfilesPageId(customId) {
  const pageStr = customId.slice(PROFILES_PAGE_PREFIX.length);
  const page = parseInt(pageStr, 10);
  return Number.isNaN(page) ? 0 : page;
}

export function formatSteam(steam) {
  if (!steam) return '*не указан*';
  const clean = steam.trim();

  // 17 цифр Steam ID
  if (/^\d{17}$/.test(clean)) {
    return `[${clean}](https://steamcommunity.com/profiles/${clean})`;
  }

  // Ссылка steamcommunity.com/profiles/ID
  const profileMatch = clean.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) {
    return `[${profileMatch[1]}](https://steamcommunity.com/profiles/${profileMatch[1]})`;
  }

  // Ссылка steamcommunity.com/id/customId
  const idMatch = clean.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/i);
  if (idMatch) {
    return `[${idMatch[1]}](https://steamcommunity.com/id/${idMatch[1]})`;
  }

  // Ник или кастомный ID
  if (/^[A-Za-z0-9_-]{3,32}$/.test(clean)) {
    return `[${clean}](https://steamcommunity.com/id/${clean})`;
  }

  if (/^https?:\/\//i.test(clean)) {
    return `[Ссылка](${clean})`;
  }

  return `\`${clean}\``;
}

export function formatTelegram(telegram) {
  if (!telegram) return '*не указан*';
  const clean = telegram.trim();

  const urlMatch = clean.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{4,32})/i);
  if (urlMatch) {
    return `[@${urlMatch[1]}](https://t.me/${urlMatch[1]})`;
  }

  const cleanUsername = clean.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{4,32}$/.test(cleanUsername)) {
    return `[@${cleanUsername}](https://t.me/${cleanUsername})`;
  }

  if (/^https?:\/\//i.test(clean)) {
    return `[Ссылка](${clean})`;
  }

  return `\`${clean}\``;
}

export function extractProfileAnswers(answers) {
  if (!Array.isArray(answers)) return { steam: null, telegram: null, realName: null, hours: null };
  const steam = answers.find((a) => a.id === 'steam')?.value?.trim() || null;
  const telegram = answers.find((a) => a.id === 'telegram')?.value?.trim() || null;
  const realName = answers.find((a) => a.id === 'name')?.value?.trim() || null;
  const hours = answers.find((a) => a.id === 'hours')?.value?.trim() || null;
  return { steam, telegram, realName, hours };
}

export function renderProfilesMessage(profiles, page = 0, guildName = '') {
  const total = profiles.length;
  const totalPages = Math.max(1, Math.ceil(total / PROFILES_PAGE_SIZE));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`👥 Принятые игроки${guildName ? ` · ${guildName}` : ''}`);

  if (total === 0) {
    embed.setDescription('В базе данных пока нет сохранённых игроков.');
    return { embeds: [embed], components: [] };
  }

  const start = currentPage * PROFILES_PAGE_SIZE;
  const pageItems = profiles.slice(start, start + PROFILES_PAGE_SIZE);

  for (let i = 0; i < pageItems.length; i++) {
    const item = pageItems[i];
    const index = start + i + 1;
    const dateObj = item.created_at ? new Date(item.created_at) : null;
    const timeUnix = dateObj && !Number.isNaN(dateObj.getTime()) ? Math.floor(dateObj.getTime() / 1000) : null;
    const timeStr = timeUnix ? `\n📅 **Принят:** <t:${timeUnix}:d>` : '';
    const nameLine = item.real_name || item.hours
      ? `👤 **Имя:** ${item.real_name || '—'} · ⏱️ **Часы:** ${item.hours || '—'}\n`
      : '';

    embed.addFields({
      name: `${index}. ${item.username} (<@${item.user_id}>)`,
      value: `${nameLine}🎮 **Steam:** ${formatSteam(item.steam)}\n✈️ **Telegram:** ${formatTelegram(item.telegram)}${timeStr}`,
      inline: false,
    });
  }

  embed.setFooter({
    text: `Страница ${currentPage + 1} из ${totalPages} · Всего игроков: ${total}`,
  });

  const buttons = [];
  if (totalPages > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${PROFILES_PAGE_PREFIX}${currentPage - 1}`)
        .setLabel('⬅️ Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`${PROFILES_PAGE_PREFIX}${currentPage + 1}`)
        .setLabel('Вперёд ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages - 1),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${PROFILES_PAGE_PREFIX}${currentPage}`)
      .setLabel('Обновить')
      .setStyle(ButtonStyle.Secondary),
  );

  buttons.push(
    new ButtonBuilder()
      .setCustomId(PROFILES_DELETE_PROMPT)
      .setLabel('Удалить')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(buttons)],
  };
}

export function renderDeleteSelectMessage(profiles, guildName = '') {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`🗑️ Удаление профиля игрока${guildName ? ` · ${guildName}` : ''}`)
    .setDescription('Выберите игрока из меню ниже, чтобы удалить его профиль из базы данных:');

  const options = profiles.slice(0, 25).map((p, i) => {
    const details = [
      p.real_name ? `Имя: ${p.real_name}` : null,
      p.hours ? `${p.hours}ч` : null,
      `Steam: ${p.steam || '—'}`,
      `TG: ${p.telegram || '—'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      label: `${i + 1}. ${p.username}`.slice(0, 100),
      value: p.user_id,
      description: details.slice(0, 100),
    };
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(PROFILES_DO_DELETE)
    .setPlaceholder('Выберите игрока для удаления...')
    .addOptions(options);

  const backButton = new ButtonBuilder()
    .setCustomId(`${PROFILES_PAGE_PREFIX}0`)
    .setLabel('⬅️ Отмена и назад к списку')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(backButton),
    ],
  };
}
