import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

const GQL_URL = 'https://gql.twitch.tv/gql';
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const STREAM_CHECK_CONCURRENCY = 5;
const TWITCH_COLOR = 0x7c6cff; // Фирменный стиль 2pz

export function extractTwitchLogin(input) {
  if (!input) return null;
  const clean = input.trim().replace(/^@/, '');
  const urlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{3,30})/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const loginMatch = clean.match(/^[A-Za-z0-9_]{3,30}$/);
  return loginMatch ? loginMatch[0].toLowerCase() : null;
}

export async function fetchTwitchStream(login) {
  const cleanLogin = login.toLowerCase().trim();
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': GQL_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query {
        user(login: "${cleanLogin}") {
          id
          login
          displayName
          profileImageURL(width: 300)
          stream {
            id
            title
            game {
              name
            }
            viewersCount
            createdAt
            type
          }
        }
      }`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ошибка Twitch API: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const user = json?.data?.user;
  if (!user) return null;

  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName || user.login,
    avatar: user.profileImageURL,
    stream:
      user.stream?.type === 'live'
        ? {
            id: user.stream.id,
            title: user.stream.title || 'Без названия',
            game: user.stream.game?.name || 'Rust',
            viewers: user.stream.viewersCount,
            createdAt: user.stream.createdAt,
          }
        : null,
  };
}

export function buildStreamAlertPayload({ login, displayName, avatar, stream, pingRole = null }) {
  const url = `https://www.twitch.tv/${login}`;
  const createdDate = stream.createdAt ? new Date(stream.createdAt) : new Date();
  const createdUnix = Math.floor(createdDate.getTime() / 1000);

  const prefix = pingRole ? (pingRole === 'everyone' ? '@everyone ' : `<@&${pingRole}> `) : '';
  const content = `${prefix}🔴 **${displayName}** в эфире: ${url}`;

  const embed = new EmbedBuilder()
    .setColor(TWITCH_COLOR)
    .setAuthor({
      name: `${displayName} начал стрим!`,
      iconURL:
        avatar ||
        'https://static-cdn.jtvnw.net/jtv_user_pictures/42fcb1b1-e729-4f51-8cb7-daecbaf0ebbb-profile_image-300x300.png',
      url,
    })
    .setTitle(stream.title || `${displayName} подрубил стрим!`)
    .setURL(url)
    .addFields(
      { name: '🎮 Игра', value: stream.game || 'Rust', inline: true },
      { name: '⏰ Начало', value: `<t:${createdUnix}:t> (<t:${createdUnix}:R>)`, inline: true },
    )
    .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg?v=${Date.now()}`)
    .setFooter({ text: '2pz · Twitch' })
    .setTimestamp(createdDate);

  const button = new ButtonBuilder()
    .setLabel('Смотреть стрим')
    .setStyle(ButtonStyle.Link)
    .setURL(url)
    .setEmoji('📺');

  const row = new ActionRowBuilder().addComponents(button);

  return { content, embeds: [embed], components: [row] };
}

export const STREAM_COMMAND = {
  name: 'stream',
  description: 'Управление рассылкой и оповещениями о стримах Twitch',
  options: [
    {
      name: 'add',
      description: 'Добавить Twitch-канал стримера для оповещений',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'channel',
          description: 'Логин или ссылка на Twitch (например chotki_mops или twitch.tv/chotki_mops)',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'remove',
      description: 'Убрать Twitch-канал стримера из оповещений',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'channel',
          description: 'Логин Twitch-канала для удаления',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'list',
      description: 'Список отслеживаемых Twitch-каналов и текущий канал оповещений',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'set-channel',
      description: 'Установить канал Discord для публикации оповещений',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'channel',
          description: 'Текстовый канал Discord (например #стримы)',
          type: ApplicationCommandOptionType.Channel,
          channel_types: [ChannelType.GuildText],
          required: true,
        },
      ],
    },
    {
      name: 'remove-channel',
      description: 'Отключить автоматические оповещения о стримах на этом сервере',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'test',
      description: 'Отправить тестовое оповещение в канал стримов',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'streamer',
          description: 'Логин стримера (по умолчанию первый из списка)',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: 'check',
      description: 'Проверить текущий статус стримера',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'streamer',
          description: 'Логин стримера (по умолчанию chotki_mops)',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
  ],
};

export const STREAM_COMMANDS = [STREAM_COMMAND];

export function createStreamAlerts({ client, db, servers, pollIntervalMs = 60_000 }) {
  let timer = null;
  const lastStreams = new Map();

  function isStaff(member, server) {
    if (!server?.staffRoleIds || !member?.roles?.cache) return false;
    return server.staffRoleIds.some((id) => member.roles.cache.has(id));
  }

  // Получить эффективный канал оповещений для сервера (БД или конфиг)
  async function getEffectiveChannelId(server) {
    const dbSettings = await db.getStreamGuildSettings(server.guildId).catch(() => null);
    if (dbSettings?.channel_id !== undefined) {
      return dbSettings.channel_id; // может быть null если отключили
    }
    return server.streamChannelId ?? null;
  }

  // Получить список отслеживаемых стримеров для сервера (БД или конфиг)
  async function getEffectiveStreamers(server) {
    const dbStreamers = await db.getTrackedStreamers(server.guildId).catch(() => []);
    if (dbStreamers.length > 0) return dbStreamers;
    return server.streamers ?? [];
  }

  async function checkStreamer(login) {
    try {
      const data = await fetchTwitchStream(login);
      if (!data) return;

      const stream = data.stream;
      if (!stream) {
        lastStreams.delete(login);
        return;
      }

      const cached = lastStreams.get(login);
      if (cached === stream.id) return;

      const lastDbStreamId = await db.getLastStreamAlert(login).catch(() => null);
      if (lastDbStreamId === stream.id) {
        lastStreams.set(login, stream.id);
        return;
      }

      lastStreams.set(login, stream.id);
      await db
        .setLastStreamAlert(login, stream.id)
        .catch((err) => console.error('Ошибка записи stream_alerts в БД:', err));

      for (const server of servers) {
        const channelId = await getEffectiveChannelId(server);
        if (!channelId) continue;

        const streamers = await getEffectiveStreamers(server);
        if (!streamers.includes(login)) continue;

        try {
          const channel = await client.channels.fetch(channelId);
          if (channel) {
            const payload = buildStreamAlertPayload({
              login: data.login,
              displayName: data.displayName,
              avatar: data.avatar,
              stream,
              pingRole: server.streamRolePing,
            });
            await channel.send(payload);
          }
        } catch (err) {
          console.error(`Не удалось отправить оповещение о стриме на сервер ${server.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`Ошибка проверки стрима ${login}:`, err.message);
    }
  }

  async function checkAll() {
    const allStreamers = new Set();
    // Собираем стримеров из БД
    const dbStreamers = await db.getAllTrackedStreamers().catch(() => []);
    for (const s of dbStreamers) allStreamers.add(s);

    // Добавляем стримеров из конфига серверов
    for (const server of servers) {
      for (const s of server.streamers ?? []) {
        allStreamers.add(s);
      }
    }

    // Опрашиваем стримеров пачками: Twitch отвечает быстро, а последовательный обход растягивается на минуты
    const queue = [...allStreamers];
    const workers = Array.from({ length: Math.min(STREAM_CHECK_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) await checkStreamer(queue.shift());
    });
    await Promise.all(workers);
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName !== 'stream') return false;

    const server = servers.find((s) => s.guildId === interaction.guildId);
    const sub = interaction.options.getSubcommand();

    // Команда /stream add <channel>
    if (sub === 'add') {
      if (!isStaff(interaction.member, server)) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      const input = interaction.options.getString('channel', true);
      const login = extractTwitchLogin(input);
      if (!login) {
        await interaction.reply({
          content: '❌ Неверный формат. Укажите логин или ссылку на канал Twitch (например: `chotki_mops` или `https://twitch.tv/chotki_mops`).',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Проверяем существование канала на Twitch
      const twitchData = await fetchTwitchStream(login).catch(() => null);
      if (!twitchData) {
        await interaction.editReply(`❌ Канал **${login}** не найден на Twitch.`);
        return true;
      }

      // Сохраняем в БД
      await db.addTrackedStreamer(interaction.guildId, login);
      await interaction.editReply(`✅ Канал **${twitchData.displayName}** ([twitch.tv/${login}](https://twitch.tv/${login})) успешно добавлен в рассылку стримов!`);
      return true;
    }

    // Команда /stream remove <channel>
    if (sub === 'remove') {
      if (!isStaff(interaction.member, server)) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      const input = interaction.options.getString('channel', true);
      const login = extractTwitchLogin(input);
      if (!login) {
        await interaction.reply({ content: '❌ Укажите логин Twitch-канала.', flags: MessageFlags.Ephemeral });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const removedFromDb = await db.removeTrackedStreamer(interaction.guildId, login);

      let removedFromConfig = false;
      if (server && Array.isArray(server.streamers)) {
        const idx = server.streamers.indexOf(login);
        if (idx !== -1) {
          server.streamers.splice(idx, 1);
          removedFromConfig = true;
        }
      }

      if (!removedFromDb && !removedFromConfig) {
        await interaction.editReply(`Канал **${login}** не был найден в списке добавленных.`);
        return true;
      }

      await interaction.editReply(`🗑️ Канал **${login}** успешно удалён из рассылки стримов.`);
      return true;
    }

    // Команда /stream list
    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const streamers = await getEffectiveStreamers(server ?? { guildId: interaction.guildId });
      const channelId = await getEffectiveChannelId(server ?? { guildId: interaction.guildId });

      const channelText = channelId ? `<#${channelId}>` : '*не настроен (используйте `/stream set-channel`)*';
      const streamersText =
        streamers.length > 0
          ? streamers.map((s, i) => `${i + 1}. [${s}](https://twitch.tv/${s})`).join('\n')
          : '*нет добавленных каналов*';

      const embed = new EmbedBuilder()
        .setColor(TWITCH_COLOR)
        .setTitle('📺 Рассылка стримов Twitch')
        .addFields(
          { name: 'Канал для оповещений в Discord', value: channelText, inline: false },
          { name: `Отслеживаемые каналы (${streamers.length})`, value: streamersText, inline: false },
        )
        .setFooter({ text: 'Используйте /stream add и /stream remove для управления' });

      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    // Команда /stream set-channel <channel>
    if (sub === 'set-channel') {
      if (!isStaff(interaction.member, server)) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      const channel = interaction.options.getChannel('channel', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await db.setStreamGuildChannel(interaction.guildId, channel.id);
      await interaction.editReply(`✅ Канал для оповещений о стримах успешно установлен на <#${channel.id}>!`);
      return true;
    }

    // Команда /stream remove-channel
    if (sub === 'remove-channel') {
      if (!isStaff(interaction.member, server)) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await db.removeStreamGuildChannel(interaction.guildId);
      await interaction.editReply('🔕 Оповещения о стримах на этом сервере отключены.');
      return true;
    }

    // Команда /stream test [streamer]
    if (sub === 'test') {
      if (!isStaff(interaction.member, server)) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const streamerInput = interaction.options.getString('streamer');
      const streamers = await getEffectiveStreamers(server ?? { guildId: interaction.guildId });
      const targetStreamer = extractTwitchLogin(streamerInput) || streamers[0] || 'chotki_mops';

      let data = await fetchTwitchStream(targetStreamer).catch(() => null);
      let stream = data?.stream;
      if (!stream) {
        stream = {
          id: 'test_stream',
          title: '🔥 Тестовый стрим 2pz / Rust / Вайп',
          game: 'Rust',
          viewers: 77,
          createdAt: new Date().toISOString(),
        };
      }

      const payload = buildStreamAlertPayload({
        login: data?.login || targetStreamer,
        displayName: data?.displayName || targetStreamer,
        avatar: data?.avatar,
        stream,
        pingRole: server?.streamRolePing,
      });

      const effectiveChannelId = await getEffectiveChannelId(server ?? { guildId: interaction.guildId });
      const targetChannelId = effectiveChannelId || interaction.channelId;
      const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);

      if (!targetChannel) {
        await interaction.editReply('❌ Не удалось найти канал для отправки.');
        return true;
      }

      await targetChannel.send(payload);

      let msg = `✅ Тестовое оповещение отправлено в <#${targetChannel.id}>!`;
      if (!effectiveChannelId) {
        msg += `\n⚠️ Внимание: канал для рассылки ещё не привязан. Используйте \`/stream set-channel\`, чтобы закрепить нужный канал.`;
      }
      await interaction.editReply(msg);
      return true;
    }

    // Команда /stream check [streamer]
    if (sub === 'check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const streamerInput = interaction.options.getString('streamer');
      const streamers = await getEffectiveStreamers(server ?? { guildId: interaction.guildId });
      const targetStreamer = extractTwitchLogin(streamerInput) || streamers[0] || 'chotki_mops';

      try {
        const data = await fetchTwitchStream(targetStreamer);
        if (!data) {
          await interaction.editReply(`Канал [twitch.tv/${targetStreamer}](https://twitch.tv/${targetStreamer}) не найден.`);
          return true;
        }
        if (!data.stream) {
          await interaction.editReply(`Канал **${data.displayName}** сейчас **оффлайн**.`);
          return true;
        }
        await interaction.editReply(
          `🔴 **${data.displayName}** сейчас в эфире!\n` +
            `**Игра:** ${data.stream.game}\n` +
            `**Название:** ${data.stream.title}\n` +
            `**Зрителей:** ${data.stream.viewers}\n` +
            `**Ссылка:** https://www.twitch.tv/${data.login}`,
        );
        return true;
      } catch (err) {
        await interaction.editReply(`Ошибка проверки: ${err.message}`);
        return true;
      }
    }

    return false;
  }

  return {
    start() {
      checkAll().catch((err) => console.error('Ошибка первой проверки стримов:', err));
      timer = setInterval(checkAll, pollIntervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
    },
    checkAll,
    handleInteraction,
  };
}
