import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';

const GQL_URL = 'https://gql.twitch.tv/gql';
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const TWITCH_COLOR = 0x7c6cff; // Фирменный стиль 2pz

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

export const STREAM_COMMANDS = [
  {
    name: 'stream-check',
    description: 'Проверить статус стрима chotki_mops',
  },
  {
    name: 'stream-test',
    description: 'Отправить тестовое оповещение о стриме (только модерация)',
  },
];

export function createStreamAlerts({ client, db, servers, pollIntervalMs = 60_000 }) {
  let timer = null;
  const lastStreams = new Map();

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
        if (!server.streamChannelId) continue;
        const streamers = server.streamers ?? ['chotki_mops'];
        if (!streamers.includes(login)) continue;

        try {
          const channel = await client.channels.fetch(server.streamChannelId);
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
    const allStreamers = new Set(['chotki_mops']);
    for (const server of servers) {
      for (const s of server.streamers ?? []) {
        allStreamers.add(s);
      }
    }

    for (const streamer of allStreamers) {
      await checkStreamer(streamer);
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    if (interaction.commandName === 'stream-check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const data = await fetchTwitchStream('chotki_mops');
        if (!data) {
          await interaction.editReply('Канал https://www.twitch.tv/chotki_mops не найден.');
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

    if (interaction.commandName === 'stream-test') {
      const server = servers.find((s) => s.guildId === interaction.guildId);
      const isStaffMember = server?.staffRoleIds?.some((id) => interaction.member?.roles?.cache?.has(id));
      if (!isStaffMember) {
        await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let data = await fetchTwitchStream('chotki_mops').catch(() => null);
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
        login: data?.login || 'chotki_mops',
        displayName: data?.displayName || 'chotki_mops',
        avatar: data?.avatar,
        stream,
        pingRole: server?.streamRolePing,
      });

      const targetChannelId = server?.streamChannelId || interaction.channelId;
      const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);

      if (!targetChannel) {
        await interaction.editReply('Не удалось найти канал для отправки.');
        return true;
      }

      await targetChannel.send(payload);

      let msg = `Тестовое оповещение отправлено в <#${targetChannel.id}>!`;
      if (!server?.streamChannelId) {
        msg += `\n⚠️ Внимание: в \`config/servers.json\` для этого сервера не указан \`streamChannelId\`. Добавьте ID нужного канала (например канала «# стримы»), чтобы оповещения приходили туда автоматически.`;
      }
      await interaction.editReply(msg);
      return true;
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
