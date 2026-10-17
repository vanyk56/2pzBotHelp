import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { readFileSync } from 'node:fs';
import { renderBanner, renderGrid } from './banner.js';
import { EVENT_EMOJI } from './events-emoji.js';

const BANNER_NAME = 'event.png';
const GRID_NAME = 'grid.png';
// Имена кастомных эмодзи для кнопок (картинки в assets/emoji), по ключам кнопок
const BUTTON_EMOJI = { going: 'event_going', late: 'event_late', no: 'event_no', check: 'event_check' };
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
      name: 'grid',
      description: 'Клетка карты, где строится клан, например: G12 (необязательно)',
      type: ApplicationCommandOptionType.String,
      required: false,
      max_length: 10,
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

// Сообщение сбора: баннер (дата, время, подключение, пароль), квадрат с клеткой карты справа,
// текст для копирования и четыре кнопки в одном ряду. Картинки прикреплены к сообщению один раз,
// при нажатии на кнопки их не перерисовываем
export function renderEvent(event, stats, { bannerName = null, gridName = null, emoji = {} } = {}) {
  const { id, data } = event;
  const pendingLabel = stats.pending === null ? 'Проверка' : `Не ответили · ${stats.pending}`;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(`**Начало:** <t:${data.startsUnix}:F> (<t:${data.startsUnix}:R>)`)
    .addFields(
      {
        name: '📋 Данные для копирования',
        value: `**Сервер:** ${data.title}\n**Дата и время:** ${data.date} ${data.time} МСК`,
      },
      { name: 'Подключение', value: codeBlock(data.connect) },
    );
  if (gridName) embed.setThumbnail(`attachment://${gridName}`);
  if (bannerName) embed.setImage(`attachment://${bannerName}`);
  else embed.setTitle(data.title);

  const row = new ActionRowBuilder().addComponents(
    button(`event:rsvp:${id}:going`, `Буду · ${stats.going}`, ButtonStyle.Success, emoji.going ?? '✅'),
    button(`event:rsvp:${id}:late`, `Опаздываю · ${stats.late}`, ButtonStyle.Primary, emoji.late ?? '⏰'),
    button(`event:rsvp:${id}:no`, `Не буду · ${stats.no}`, ButtonStyle.Danger, emoji.no ?? '❌'),
    button(`event:check:${id}`, pendingLabel, ButtonStyle.Secondary, emoji.check ?? '🔎'),
  );

  return { embeds: [embed], components: [row] };
}

// Кастомные эмодзи сервера для кнопок. Если эмодзи нет, в кнопке остаётся обычный символ
function resolveEmoji(guild) {
  return Object.fromEntries(
    Object.entries(BUTTON_EMOJI).map(([key, name]) => {
      const found = guild?.emojis?.cache?.find((e) => e.name === name);
      return [key, found ? { id: found.id, name: found.name } : null];
    }),
  );
}

// Загружает эмодзи из assets/emoji на сервер, если их там ещё нет. Нужно право «Управление выражениями»
export async function ensureEventEmojis(guild) {
  await guild.emojis.fetch();
  for (const name of Object.keys(EVENT_EMOJI)) {
    if (guild.emojis.cache.some((e) => e.name === name)) continue;
    const attachment = readFileSync(new URL(`../assets/emoji/${name}.png`, import.meta.url));
    await guild.emojis.create({ name, attachment });
  }
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

// Участники, которые ещё не ответили. Если роль не выбрана, проверяем всех участников сервера
// (id роли @everyone совпадает с id сервера)
async function pendingMembers(guild, roleId, rsvps) {
  const target = roleId ?? guild.id;
  const everyone = target === guild.id;
  const responded = new Set(rsvps.map((r) => r.user_id));
  const members = await listGuildMembers(guild);
  return members.filter(
    (m) => !m.user.bot && (everyone || m.roles.cache.has(target)) && !responded.has(m.id),
  );
}

// Список упоминаний в одном поле embed (до 1024 символов); хвост заменяется на «и ещё N»
function mentionList(ids) {
  if (ids.length === 0) return '—';
  let text = '';
  for (let i = 0; i < ids.length; i += 1) {
    const next = `<@${ids[i]}>`;
    const candidate = text ? `${text} ${next}` : next;
    if (candidate.length > 1000) return `${text} и ещё ${ids.length - i}`;
    text = candidate;
  }
  return text;
}

// Окно для админа: кто будет, опаздывает, не будет и кто не ответил. Упоминания не пингуют
export function renderLists(event, rsvps, pending) {
  const byStatus = { going: [], late: [], no: [] };
  for (const { user_id: userId, status } of rsvps) byStatus[status]?.push(userId);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Сбор: ${event.data.title}`)
    .addFields(
      { name: `✅ Буду · ${byStatus.going.length}`, value: mentionList(byStatus.going) },
      { name: `⏰ Опаздывают · ${byStatus.late.length}`, value: mentionList(byStatus.late) },
      { name: `❌ Не будут · ${byStatus.no.length}`, value: mentionList(byStatus.no) },
      { name: `❔ Не ответили · ${pending.length}`, value: mentionList(pending.map((m) => m.id)) },
    );

  const components = [];
  if (pending.length > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        button(`event:remind:${event.id}`, 'Напомнить не ответившим', ButtonStyle.Primary, '📣'),
      ),
    );
  }
  return { embeds: [embed], components };
}

async function renderImage(render, what) {
  try {
    return await render();
  } catch (error) {
    console.error(`Не удалось нарисовать: ${what}`, error);
    return null;
  }
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

  async function buildView(event, guild, options) {
    const rsvps = await db.eventRsvps(event.id);
    const counts = { going: 0, late: 0, no: 0 };
    for (const { status } of rsvps) counts[status] += 1;

    const pending = await pendingMembers(guild, event.role_id, rsvps);
    const view = renderEvent(event, { ...counts, pending: pending.length }, {
      ...options,
      emoji: resolveEmoji(guild),
    });
    return { view, pending, rsvps };
  }

  async function createEvent(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const title = interaction.options.getString('title', true).trim();
    const date = interaction.options.getString('date', true).trim();
    const time = interaction.options.getString('time', true).trim();
    const connect = interaction.options.getString('connect', true).trim();
    const role = interaction.options.getRole('role');
    const grid = interaction.options.getString('grid')?.trim().toUpperCase() || null;

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
      startsUnix: Math.floor(startsAt.getTime() / 1000),
    };
    const event = await db.createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      data,
      // Без роли проверяем всех участников сервера
      roleId: role?.id ?? interaction.guildId,
    });

    // Картинки не ломают сбор: если что-то не нарисовалось, публикуем без неё
    const banner = await renderImage(() => renderBanner(data), 'баннер сбора');
    const gridImage = grid ? await renderImage(() => renderGrid(grid), 'квадрат карты') : null;

    await interaction.deferReply();
    const { view } = await buildView(event, interaction.guild, {
      bannerName: banner ? BANNER_NAME : null,
      gridName: gridImage ? GRID_NAME : null,
    });
    const files = [];
    if (banner) files.push(new AttachmentBuilder(banner, { name: BANNER_NAME }));
    if (gridImage) files.push(new AttachmentBuilder(gridImage, { name: GRID_NAME }));
    return interaction.editReply({ ...view, files });
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
    // Меняем только кнопки: картинка и текст сбора остаются как были
    const { view } = await buildView(event, interaction.guild);
    await interaction.editReply({ components: view.components });
  }

  // Списки для модерации: личное окно, видно только нажавшему
  async function handleCheck(interaction, server, rawId) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');
    const event = await loadEvent(interaction, rawId);
    if (!event) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { pending, rsvps } = await buildView(event, interaction.guild);
    return interaction.editReply(renderLists(event, rsvps, pending));
  }

  // Напоминание только тем, кто не ответил. Пинги идут в канал сбора
  async function handleRemind(interaction, server, rawId) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');
    const event = await loadEvent(interaction, rawId);
    if (!event) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { pending } = await buildView(event, interaction.guild);
    if (pending.length === 0) return interaction.editReply('Все ответили.');

    for (const members of chunk(pending, MENTIONS_PER_MESSAGE)) {
      const ids = members.map((m) => m.id);
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
      if (kind === 'remind') await handleRemind(interaction, server, rawId);
      return true;
    }

    return false;
  }

  return { handleInteraction };
}
