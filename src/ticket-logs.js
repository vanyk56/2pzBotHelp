import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { formatSteam, formatTelegram } from './profiles.js';

export const LOG_COLORS = {
  created: 0x5865f2, // Blurple
  accepted: 0x57f287, // Green
  rejected: 0xed4245, // Red
  review: 0xfee75c, // Yellow
  call: 0x9b59b6, // Purple
  closed: 0x95a5a6, // Grey
};

export const LOG_TITLES = {
  created: '🎫 Новый тикет',
  accepted: '✅ Тикет принят',
  rejected: '❌ Тикет отклонён',
  review: '⏳ Взято на рассмотрение',
  call: '📞 Вызов на обзвон',
  closed: '🔒 Тикет закрыт',
};

export function extractTicketDetails(answers) {
  const list = Array.isArray(answers)
    ? answers
    : typeof answers === 'string'
      ? (() => {
          try {
            return JSON.parse(answers);
          } catch {
            return [];
          }
        })()
      : [];

  const getVal = (idRegex, labelRegex) => {
    const found = list.find(
      (a) => (idRegex && idRegex.test(a.id)) || (labelRegex && labelRegex.test(a.label)),
    );
    return found?.value?.trim() || null;
  };

  const name = getVal(/^name$/, /ваше имя|имя/i);
  const hours = getVal(/^hours$/, /часов|часы/i);
  const steam = getVal(/^steam$/, /steam/i);
  const telegram = getVal(/^telegram$/, /telegram|тг/i);
  const age = getVal(/^age$/, /возраст|лет/i);
  const dailyOnline = getVal(/^daily_online$/, /онлайн/i);
  const target = getVal(/^target$/, /нарушител/i);
  const violationDate = getVal(/^violation_date$/, /когда/i);

  const primaryIds = new Set([
    'name',
    'hours',
    'steam',
    'telegram',
    'age',
    'daily_online',
    'target',
    'violation_date',
  ]);
  const extraAnswers = list.filter((a) => !primaryIds.has(a.id) && a.value?.trim());

  return { name, hours, steam, telegram, age, dailyOnline, target, violationDate, extraAnswers };
}

export function buildTicketLogEmbed({
  action = 'created',
  ticket,
  type,
  answers,
  decidedBy = null,
  reason = null,
  roleNote = null,
}) {
  const details = extractTicketDetails(answers ?? ticket?.answers);
  const color = LOG_COLORS[action] ?? 0x5865f2;
  const typeName = type?.name || ticket?.ticket_type || 'Тикет';
  const title = `${LOG_TITLES[action] ?? 'Тикет'}: ${typeName}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp(new Date());

  if (ticket?.id) {
    embed.setFooter({ text: `ID тикета: #${ticket.id} · Статус: ${action}` });
  }

  const userMention = ticket?.user_id ? `<@${ticket.user_id}>` : '*неизвестно*';
  const username = ticket?.username ? ` (${ticket.username})` : '';
  embed.addFields({
    name: '👤 Игрок',
    value: `${userMention}${username}`,
    inline: false,
  });

  embed.addFields(
    { name: '📝 Имя', value: details.name || '*не указано*', inline: true },
    { name: '⏱️ Часы', value: details.hours || '*не указано*', inline: true },
    { name: '🎮 Steam', value: formatSteam(details.steam), inline: true },
    { name: '✈️ Telegram', value: formatTelegram(details.telegram), inline: true },
  );

  if (details.age) {
    embed.addFields({ name: '🎂 Возраст', value: details.age, inline: true });
  }
  if (details.dailyOnline) {
    embed.addFields({ name: '⚡ Онлайн/день', value: details.dailyOnline, inline: true });
  }
  if (details.target) {
    embed.addFields({ name: '🎯 Нарушитель', value: details.target, inline: true });
  }
  if (details.violationDate) {
    embed.addFields({ name: '📅 Когда произошло', value: details.violationDate, inline: true });
  }

  if (decidedBy) {
    const modLabel =
      action === 'accepted'
        ? '🛡️ Принял'
        : action === 'rejected'
          ? '🛡️ Отклонил'
          : action === 'review'
            ? '🛡️ Взял на рассмотрение'
            : action === 'call'
              ? '🛡️ Вызвал на обзвон'
              : '🛡️ Модератор';
    embed.addFields({ name: modLabel, value: `<@${decidedBy}>`, inline: true });
  }

  if (roleNote) {
    embed.addFields({ name: '🏷️ Роль', value: roleNote, inline: false });
  }

  if (reason) {
    embed.addFields({ name: '💬 Причина отказа', value: reason, inline: false });
  }

  if (ticket?.channel_id) {
    embed.addFields({ name: '🧵 Ветка тикета', value: `<#${ticket.channel_id}>`, inline: false });
  }

  if (action === 'created' && details.extraAnswers?.length > 0) {
    for (const extra of details.extraAnswers.slice(0, 3)) {
      const val = extra.value.length > 250 ? `${extra.value.slice(0, 247)}...` : extra.value;
      embed.addFields({ name: `📋 ${extra.label}`, value: val, inline: false });
    }
  }

  return embed;
}

export function buildTicketLogPayload({
  action,
  ticket,
  type,
  answers,
  decidedBy,
  reason,
  roleNote,
  threadUrl,
}) {
  const embed = buildTicketLogEmbed({
    action,
    ticket,
    type,
    answers,
    decidedBy,
    reason,
    roleNote,
  });

  const components = [];
  if (threadUrl) {
    const btn = new ButtonBuilder()
      .setLabel('Перейти к тикету')
      .setStyle(ButtonStyle.Link)
      .setURL(threadUrl)
      .setEmoji('🧵');
    components.push(new ActionRowBuilder().addComponents(btn));
  }

  return { embeds: [embed], components };
}

export async function getOrCreateTicketLogChannel(guild, server, client) {
  if (!guild) return null;

  if (server.ticketLogChannelId) {
    const configured = await guild.channels.fetch(server.ticketLogChannelId).catch(() => null);
    if (configured) return configured;
  }

  const channels = await guild.channels.fetch().catch(() => null);
  if (channels) {
    const existing = channels.find(
      (c) =>
        c &&
        c.type === ChannelType.GuildText &&
        /^(logs?[-_]?tickets?|ticket[-_]?logs?|тикет[-_]?логи|логи[-_]?тикетов)$/i.test(c.name),
    );
    if (existing) return existing;
  }

  try {
    const staffOverwrites = (server.staffRoleIds ?? []).map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    }));

    const channel = await guild.channels.create({
      name: 'тикет-логи',
      type: ChannelType.GuildText,
      topic: 'Логи тикетов и заявок (только для администрации)',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...staffOverwrites,
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });
    return channel;
  } catch (error) {
    console.warn(`Не удалось создать канал «тикет-логи» на сервере ${guild.name}:`, error.message);
    return null;
  }
}

export async function sendTicketLog({
  guild,
  server,
  client,
  action,
  ticket,
  type,
  answers,
  decidedBy,
  reason,
  roleNote,
  channel,
  files = [],
}) {
  try {
    const logChannel = await getOrCreateTicketLogChannel(guild, server, client);
    if (!logChannel) return null;

    const threadUrl =
      channel?.url || (ticket?.channel_id && guild?.id ? `https://discord.com/channels/${guild.id}/${ticket.channel_id}` : null);

    const payload = buildTicketLogPayload({
      action,
      ticket,
      type,
      answers,
      decidedBy,
      reason,
      roleNote,
      threadUrl,
    });

    if (files?.length > 0) {
      payload.files = files;
    }

    return await logChannel.send(payload);
  } catch (error) {
    console.error('Ошибка отправки лога тикета:', error);
    return null;
  }
}

export function buildWarnLogEmbed({
  action = 'warn',
  warn,
  moderatorId,
  targetUserId,
  activeCount = 1,
  sanctionNote = null,
}) {
  const isWarn = action === 'warn';
  const embed = new EmbedBuilder()
    .setColor(isWarn ? (activeCount >= 3 ? 0xed4245 : 0xfee75c) : 0x57f287)
    .setTitle(
      isWarn
        ? `⚠️ Выдан варн #${warn.id} (${activeCount}/3)`
        : `✅ Снят варн #${warn.id} (осталось активных: ${activeCount})`,
    )
    .addFields(
      { name: '👤 Игрок', value: `<@${targetUserId}>`, inline: true },
      { name: '🛡️ Модератор', value: `<@${moderatorId}>`, inline: true },
      {
        name: isWarn ? '💬 Причина варна' : '💬 Причина снятия',
        value: (isWarn ? warn.reason : warn.unwarn_reason || warn.reason) || '*не указана*',
        inline: false,
      },
    )
    .setTimestamp(new Date());

  if (warn.expires_at && isWarn) {
    const unix = Math.floor(new Date(warn.expires_at).getTime() / 1000);
    embed.addFields({ name: '⏳ Срок действия', value: `<t:${unix}:f> (<t:${unix}:R>)`, inline: true });
  }

  if (sanctionNote) {
    embed.addFields({ name: '🚨 Санкции', value: sanctionNote, inline: false });
  }

  return embed;
}

export async function sendWarnLog({
  guild,
  server,
  client,
  action = 'warn',
  warn,
  moderatorId,
  targetUserId,
  activeCount,
  sanctionNote,
}) {
  try {
    const logChannel = await getOrCreateTicketLogChannel(guild, server, client);
    if (!logChannel) return null;

    const embed = buildWarnLogEmbed({
      action,
      warn,
      moderatorId,
      targetUserId,
      activeCount,
      sanctionNote,
    });

    return await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Ошибка отправки лога варна:', error);
    return null;
  }
}
