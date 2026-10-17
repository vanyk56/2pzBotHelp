import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

const RSVP_STATUSES = ['going', 'late', 'no'];
const MEMBER_PAGE = 1000;
const MENTIONS_PER_MESSAGE = 30;
const MOSCOW_OFFSET_HOURS = 3;

// Команда /event: доступна только на серверах с флагом events в servers.json
export const EVENT_COMMAND = {
  name: 'event',
  description: 'Опубликовать сбор на вайп с кнопками ответа',
  options: [
    {
      name: 'title',
      description: 'Название, например: Я',
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 100,
    },
    {
      name: 'date',
      description: 'Дата по МСК, например: 12.12.2026',
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 10,
    },
    {
      name: 'time',
      description: 'Время по МСК, например: 12:00',
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 5,
    },
    {
      name: 'connect',
      description: 'Строка подключения, например: connect 1.2.3.4:28015',
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 200,
    },
    {
      name: 'password',
      description: 'Пароль сервера',
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 200,
    },
    {
      name: 'role',
      description: 'Роль, у которой проверяем ответы (необязательно)',
      type: ApplicationCommandOptionType.Role,
      required: false,
    },
  ],
};

// Дата и время в МСК (UTC+3) → момент времени. Бросает ошибку, если формат неверный или даты не существует
export function parseMoscowStart(dateText, timeText) {
  const date = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(dateText.trim());
  const time = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!date || !time) throw new Error('Дата должна быть в формате 12.12.2026, время в формате 12:00 (МСК).');

  const [day, month, year] = [Number(date[1]), Number(date[2]), Number(date[3])];
  const [hour, minute] = [Number(time[1]), Number(time[2])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error('Проверьте дату и время: такой даты или времени не существует.');
  }

  const ms = Date.UTC(year, month - 1, day, hour - MOSCOW_OFFSET_HOURS, minute);
  // Например, 31.02 Date.UTC переносит в март: проверяем, что день остался тем же
  if (new Date(ms + MOSCOW_OFFSET_HOURS * 3_600_000).getUTCDate() !== day) {
    throw new Error('Такой даты не существует.');
  }
  return new Date(ms);
}

export function moscowWeekday(date) {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'Europe/Moscow' }).format(date);
}

const codeBlock = (text) => `\`\`\`\n${text}\n\`\`\``;

const button = (customId, label, style, emoji) =>
  new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setEmoji(emoji);

// Сообщение сбора: блок с датой, временем, подключением и паролем, под ним кнопки с количеством ответов
export function renderEvent(event, stats) {
  const { id, data } = event;
  const pendingLabel = stats.pending === null ? 'Проверка' : `Проверка · не ответили: ${stats.pending}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(data.title)
    .setDescription('**ВАЙП** · время указано по МСК')
    .addFields(
      { name: 'Дата вайпа', value: `${data.date}\n${data.weekday}`, inline: true },
      { name: 'Начало (МСК)', value: `**${data.time}**`, inline: true },
      { name: 'Старт у вас', value: `<t:${data.startsUnix}:F> · <t:${data.startsUnix}:R>` },
      { name: 'Подключение', value: codeBlock(data.connect) },
      { name: 'Пароль', value: codeBlock(data.password), inline: true },
    );

  const row = new ActionRowBuilder().addComponents(
    button(`event:rsvp:${id}:going`, `Буду на вайпе · ${stats.going}`, ButtonStyle.Success, '✅'),
    button(`event:rsvp:${id}:late`, `Опаздываю · ${stats.late}`, ButtonStyle.Primary, '⏰'),
    button(`event:rsvp:${id}:no`, `Не буду · ${stats.no}`, ButtonStyle.Danger, '❌'),
    button(`event:check:${id}`, pendingLabel, ButtonStyle.Secondary, '🔎'),
  );

  return { embeds: [embed], components: [row] };
}

// Все участники сервера через REST: привилегированные intents не нужны
async function listGuildMembers(guild) {
  const members = [];
  let after;
  for (;;) {
    const page = await guild.members.list({ limit: MEMBER_PAGE, after, cache: true });
    members.push(...page.values());
    if (page.size < MEMBER_PAGE) break;
    after = page.lastKey();
  }
  return members;
}

// Участники выбранной роли, которые ещё не ответили. null — если роль для сбора не выбрана
async function pendingMembers(guild, roleId, rsvps) {
  if (!roleId) return null;
  const responded = new Set(rsvps.map((r) => r.user_id));
  const members = await listGuildMembers(guild);
  return members.filter((m) => !m.user.bot && m.roles.cache.has(roleId) && !responded.has(m.id));
}

const chunk = (items, size) => {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
};

export function createEventBot({ db, servers }) {
  const eventServers = new Map(servers.filter((s) => s.events).map((s) => [s.guildId, s]));

  const isStaff = (member, server) => {
    const roles = Array.isArray(member?.roles) ? member.roles : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds.includes(id));
  };

  const replyEphemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  async function buildView(event, guild) {
    const rsvps = await db.eventRsvps(event.id);
    const counts = { going: 0, late: 0, no: 0 };
    for (const { status } of rsvps) counts[status] += 1;

    const pending = await pendingMembers(guild, event.role_id, rsvps);
    const view = renderEvent(event, { ...counts, pending: pending?.length ?? null });
    return { view, pending };
  }

  async function createEvent(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const title = interaction.options.getString('title', true).trim();
    const date = interaction.options.getString('date', true).trim();
    const time = interaction.options.getString('time', true).trim();
    const connect = interaction.options.getString('connect', true).trim();
    const password = interaction.options.getString('password', true).trim();
    const role = interaction.options.getRole('role');

    let startsAt;
    try {
      startsAt = parseMoscowStart(date, time);
    } catch (error) {
      return replyEphemeral(interaction, error.message);
    }

    const data = {
      title,
      date,
      time,
      weekday: moscowWeekday(startsAt),
      connect,
      password,
      startsUnix: Math.floor(startsAt.getTime() / 1000),
    };
    const event = await db.createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      data,
      roleId: role?.id ?? null,
    });

    await interaction.deferReply();
    const { view } = await buildView(event, interaction.guild);
    return interaction.editReply(view);
  }

  async function loadEvent(interaction, rawId) {
    const event = await db.getEvent(Number(rawId));
    if (!event || event.guild_id !== interaction.guildId) {
      await replyEphemeral(interaction, 'Сбор не найден.');
      return null;
    }
    return event;
  }

  async function handleRsvp(interaction, rawId, status) {
    if (!RSVP_STATUSES.includes(status)) return;
    const event = await loadEvent(interaction, rawId);
    if (!event) return;

    await interaction.deferUpdate();
    await db.setRsvp(event.id, interaction.user.id, status);
    const { view } = await buildView(event, interaction.guild);
    await interaction.editReply(view);
  }

  async function handleCheck(interaction, server, rawId) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');
    const event = await loadEvent(interaction, rawId);
    if (!event) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { pending } = await buildView(event, interaction.guild);
    if (pending === null) return interaction.editReply('В этом сборе не выбрана роль для проверки.');
    if (pending.length === 0) return interaction.editReply('Все ответили.');

    for (const ids of chunk(pending.map((m) => m.id), MENTIONS_PER_MESSAGE)) {
      await interaction.channel.send({
        content: `Не ответили на сбор «${event.data.title}»: ${ids.map((id) => `<@${id}>`).join(' ')}`,
        allowedMentions: { users: ids },
      });
    }
    return interaction.editReply(`Напомнил ${pending.length} игрокам.`);
  }

  // Возвращает true, если взаимодействие относится к сборам
  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'event') {
      const server = eventServers.get(interaction.guildId);
      if (!server) return false;
      await createEvent(interaction, server);
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith('event:')) {
      const server = eventServers.get(interaction.guildId);
      if (!server) return false;
      const [, kind, rawId, status] = interaction.customId.split(':');
      if (kind === 'rsvp') await handleRsvp(interaction, rawId, status);
      if (kind === 'check') await handleCheck(interaction, server, rawId);
      return true;
    }

    return false;
  }

  return { handleInteraction };
}
