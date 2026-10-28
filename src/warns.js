import {
  ApplicationCommandOptionType,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { sendWarnLog } from './ticket-logs.js';

export const WARN_COMMANDS = [
  {
    name: 'warn',
    description: 'Выдать варн игроку (навсегда; при 3/3 — бан на сервере)',
    options: [
      {
        name: 'user',
        description: 'Игрок, которому выдаётся варн',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'Причина предупреждения',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: 'unwarn',
    description: 'Снять предупреждение (варн) с игрока',
    options: [
      {
        name: 'warn_id',
        description: 'ID конкретного варна (например 12)',
        type: ApplicationCommandOptionType.Integer,
        required: false,
      },
      {
        name: 'user',
        description: 'Или игрок (будет снят последний активный варн)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: 'reason',
        description: 'Причина снятия предупреждения',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'warns',
    description: 'Посмотреть историю предупреждений игрока',
    options: [
      {
        name: 'user',
        description: 'Игрок для просмотра варнов',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
];

/**
 * Ищет канал для оповещений о варнах (#🛑-varn, #varn, #варны)
 */
export async function getWarnChannel(guild, server) {
  if (!guild) return null;
  if (server?.warnChannelId) {
    const ch = await guild.channels.fetch(server.warnChannelId).catch(() => null);
    if (ch) return ch;
  }
  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return null;
  return (
    channels.find(
      (c) =>
        c &&
        c.type === ChannelType.GuildText &&
        /(varn|warn|варн)/i.test(c.name),
    ) || null
  );
}

/**
 * Ищет роль варна на сервере (по ID из настроек или по названию «Варн» / «Warn»)
 */
export async function getWarnRole(guild, server) {
  if (!guild) return null;
  if (server?.warnRoleId) {
    const role = await guild.roles.fetch(server.warnRoleId).catch(() => null);
    if (role) return role;
  }
  const roles = await guild.roles.fetch().catch(() => null);
  if (!roles) return null;
  return (
    roles.find(
      (r) => r && /(^|\s)(варн|warn|предупреждение)(\s|$)/i.test(r.name),
    ) || null
  );
}

export function createWarnManager({ db, client, servers }) {
  const serverByGuild = new Map(servers.map((s) => [s.guildId, s]));

  const isStaff = (member, server) => {
    if (!server) return false;
    const roles = Array.isArray(member?.roles)
      ? member.roles
      : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds?.includes(id));
  };

  const replyEphemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  async function handleWarn(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true).trim();

    if (targetUser.bot) {
      return replyEphemeral(interaction, 'Ботам нельзя выдавать варны.');
    }

    await interaction.deferReply();

    // Варны бессрочные (навсегда)
    const warn = await db.addWarn({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      durationDays: 0,
      expiresAt: null,
    });

    const activeWarns = await db.getActiveWarns(interaction.guildId, targetUser.id);
    const activeCount = activeWarns.length;

    let member = null;
    try {
      member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    } catch {}

    // Выдача роли варна (если на сервере есть роль «Варн» или настроена warnRoleId)
    let roleAssignedText = null;
    try {
      const warnRole = await getWarnRole(interaction.guild, server);
      if (warnRole && member) {
        if (!member.roles.cache.has(warnRole.id)) {
          await member.roles.add(warnRole.id, 'Выдан варн');
        }
        roleAssignedText = `Выдана роль <@&${warnRole.id}>`;
      }
    } catch (err) {
      console.warn('Не удалось выдать роль варна:', err.message);
    }

    let sanctionNote = null;
    const willBan = activeCount >= 3;

    if (willBan) {
      sanctionNote = '🚨 **Достигнут лимит 3/3 варнов: игроку выдан БАН на сервере!**';
    }

    // 1. Оповещение игроку в ЛС (отправляем ДО бана, пока есть общий сервер)
    let dmDelivered = false;
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(activeCount >= 3 ? 0xed4245 : 0xfee75c)
        .setTitle(`⚠️ Вам выдан варн на сервере ${interaction.guild.name}`)
        .addFields(
          { name: '💬 Причина', value: reason, inline: false },
          { name: '⏳ Срок действия', value: 'Бессрочно (навсегда)', inline: true },
          { name: '📊 Активных варнов', value: `**${activeCount}/3**`, inline: true },
          { name: '🛡️ Модератор', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setDescription(
          '🚨 **ВНИМАНИЕ: При наличии 3 варнов вам выдаётся БАН на сервере!**\n\n' +
            `📩 *Варны не сгорают по времени. За обжалованием варнов писать в тикет на сервере:* <#${server.panelChannelId}>`,
        )
        .setTimestamp(new Date());

      if (sanctionNote) {
        dmEmbed.addFields({ name: '🚨 Применённые санкции', value: sanctionNote, inline: false });
      }

      await targetUser.send({ embeds: [dmEmbed] });
      dmDelivered = true;
    } catch {
      dmDelivered = false;
    }

    // 2. Исполнение бана при 3/3 варнах
    if (willBan && member) {
      try {
        if (server.acceptedRoleId && member.roles.cache.has(server.acceptedRoleId)) {
          await member.roles.remove(server.acceptedRoleId).catch(() => {});
        }
        if (member.bannable) {
          await member.ban({
            reason: `3/3 активных варнов (лимит). Последняя причина: ${reason}`,
          });
        } else {
          await member.timeout(28 * 24 * 60 * 60 * 1000, '3/3 активных варнов');
          sanctionNote = '🚨 Игрок набрал 3/3 варнов! (Выдан максимальный таймаут, так как у бота нет прав забанить из-за иерархии ролей)';
        }
      } catch (err) {
        console.warn('Ошибка при бане игрока за 3 варна:', err.message);
      }
    }

    // 3. Публичное оповещение на сервере в канал варнов (#🛑-varn / #varn)
    const warnChannel = await getWarnChannel(interaction.guild, server);
    const serverEmbed = new EmbedBuilder()
      .setColor(activeCount >= 3 ? 0xed4245 : 0xfee75c)
      .setTitle(`⚠️ Выдан варн #${warn.id}`)
      .setDescription(
        `Игроку <@${targetUser.id}> успешно выдан варн (**${activeCount}/3**).\n\n` +
          `• **Причина:** ${reason}\n` +
          `• **Срок:** Бессрочно (навсегда)\n` +
          `• **Модератор:** <@${interaction.user.id}>\n` +
          (roleAssignedText ? `• **Роль:** ${roleAssignedText}\n` : '') +
          `\n🚨 **ВНИМАНИЕ: При наличии 3 варнов выдаётся БАН на сервере!**\n` +
          `📩 *Варны не имеют срока. За обжалованием варнов писать в тикет:* <#${server.panelChannelId}>\n` +
          (sanctionNote ? `\n${sanctionNote}` : ''),
      )
      .setTimestamp(new Date());

    if (warnChannel && warnChannel.id !== interaction.channelId) {
      await warnChannel
        .send({
          content: `<@${targetUser.id}>, вам выдан варн!`,
          embeds: [serverEmbed],
        })
        .catch((err) => console.warn('Не удалось отправить сообщение в канал варнов:', err.message));
    }

    // 4. Логирование в #тикет-логи для администрации
    await sendWarnLog({
      guild: interaction.guild,
      server,
      client,
      action: 'warn',
      warn,
      moderatorId: interaction.user.id,
      targetUserId: targetUser.id,
      activeCount,
      sanctionNote,
    });

    const dmStatusText = dmDelivered ? '✅ Оповещение отправлено в ЛС' : '⚠️ ЛС закрыты (оповещён на сервере)';
    serverEmbed.setFooter({ text: `${dmStatusText} · Варн бессрочный` });

    return interaction.editReply({ embeds: [serverEmbed] });
  }

  async function handleUnwarn(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const warnId = interaction.options.getInteger('warn_id');
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason')?.trim() || 'Снято модератором';

    if (!warnId && !targetUser) {
      return replyEphemeral(interaction, 'Укажите ID варна (`warn_id`) или игрока (`user`).');
    }

    await interaction.deferReply();

    let removedWarn = null;
    let targetUserId = targetUser?.id ?? null;

    if (warnId) {
      const existing = await db.getWarnById(warnId);
      if (!existing || existing.guild_id !== interaction.guildId) {
        return interaction.editReply(`Варн #${warnId} не найден.`);
      }
      if (!existing.active) {
        return interaction.editReply(`Варн #${warnId} уже неактивен.`);
      }
      targetUserId = existing.user_id;
      removedWarn = await db.removeWarn(warnId, interaction.user.id, reason);
    } else {
      removedWarn = await db.removeLatestActiveWarn(
        interaction.guildId,
        targetUser.id,
        interaction.user.id,
        reason,
      );
    }

    if (!removedWarn) {
      return interaction.editReply('Активный варн для снятия не найден.');
    }

    const remainingActive = await db.getActiveWarns(interaction.guildId, targetUserId);
    const activeCount = remainingActive.length;

    // Снятие роли варна, если активных варнов больше нет
    let roleRemovedText = null;
    if (activeCount === 0) {
      try {
        const warnRole = await getWarnRole(interaction.guild, server);
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (warnRole && member && member.roles.cache.has(warnRole.id)) {
          await member.roles.remove(warnRole.id, 'Сняты все варны');
          roleRemovedText = `Роль <@&${warnRole.id}> снята`;
        }
      } catch (err) {
        console.warn('Не удалось снять роль варна:', err.message);
      }
    }

    // Оповещение в ЛС
    try {
      const userObj = await client.users.fetch(targetUserId).catch(() => null);
      if (userObj) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`✅ С вас снят варн на сервере ${interaction.guild.name}`)
          .setDescription(
            `Варн #${removedWarn.id} был досрочно снят модератором <@${interaction.user.id}>.\n\n` +
              `• **Причина снятия:** ${reason}\n` +
              `• **Осталось активных варнов:** **${activeCount}/3**` +
              (roleRemovedText ? `\n• **Роль:** ${roleRemovedText}` : ''),
          )
          .setTimestamp(new Date());
        await userObj.send({ embeds: [dmEmbed] });
      }
    } catch {}

    // Оповещение в канал варнов (#varn)
    const warnChannel = await getWarnChannel(interaction.guild, server);
    const unwarnEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`✅ Снят варн #${removedWarn.id}`)
      .setDescription(
        `С игрока <@${targetUserId}> успешно снят варн #${removedWarn.id}.\n\n` +
          `• **Причина снятия:** ${reason}\n` +
          `• **Осталось активных варнов:** **${activeCount}/3**\n` +
          `• **Модератор:** <@${interaction.user.id}>` +
          (roleRemovedText ? `\n• **Роль:** ${roleRemovedText}` : ''),
      )
      .setTimestamp(new Date());

    if (warnChannel && warnChannel.id !== interaction.channelId) {
      await warnChannel
        .send({
          content: `<@${targetUserId}>, ваш варн был снят!`,
          embeds: [unwarnEmbed],
        })
        .catch(() => {});
    }

    // Лог
    await sendWarnLog({
      guild: interaction.guild,
      server,
      client,
      action: 'unwarn',
      warn: removedWarn,
      moderatorId: interaction.user.id,
      targetUserId,
      activeCount,
    });

    return interaction.editReply({ embeds: [unwarnEmbed] });
  }

  async function handleWarns(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const targetUser = interaction.options.getUser('user', true);
    await interaction.deferReply();

    const allWarns = await db.getAllWarns(interaction.guildId, targetUser.id);
    const activeWarns = allWarns.filter((w) => w.active);

    const embed = new EmbedBuilder()
      .setColor(activeWarns.length >= 3 ? 0xed4245 : activeWarns.length > 0 ? 0xfee75c : 0x57f287)
      .setTitle(`📋 История предупреждений: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `👤 Игрок: <@${targetUser.id}>\n` +
          `⚠️ Активных варнов: **${activeWarns.length}/3**\n` +
          `📜 Всего получено: **${allWarns.length}**\n\n` +
          `🚨 **При наличии 3 варнов выдаётся БАН на сервере!**\n` +
          `📩 *Варны не сгорают по времени. За обжалованием варнов писать в тикет:* <#${server.panelChannelId}>\n\n` +
          (allWarns.length === 0
            ? '✅ У игрока нет предупреждений.'
            : allWarns
                .slice(0, 10)
                .map((w) => {
                  const status = w.active ? '🔴 **Активен**' : '🟢 **Снят**';
                  const createdUnix = Math.floor(new Date(w.created_at).getTime() / 1000);
                  return (
                    `**#${w.id}** [${status}] — *«${w.reason}»*\n` +
                    `└ Выдан: <t:${createdUnix}:d> (<@${w.moderator_id}>) · Срок: бессрочно` +
                    (w.unwarn_reason ? ` · Снял: <@${w.unwarned_by}> (*${w.unwarn_reason}*)` : '')
                  );
                })
                .join('\n\n')),
      )
      .setFooter({ text: 'Лимит: 3 активных варна = бан' })
      .setTimestamp(new Date());

    return interaction.editReply({ embeds: [embed] });
  }

  return {
    async handleInteraction(interaction) {
      if (!interaction.isChatInputCommand()) return false;
      const { commandName } = interaction;
      if (!['warn', 'unwarn', 'warns'].includes(commandName)) return false;

      const server = serverByGuild.get(interaction.guildId);
      if (!server) {
        await replyEphemeral(interaction, 'Бот не настроен для этого сервера.');
        return true;
      }

      if (commandName === 'warn') await handleWarn(interaction, server);
      else if (commandName === 'unwarn') await handleUnwarn(interaction, server);
      else if (commandName === 'warns') await handleWarns(interaction, server);

      return true;
    },
  };
}
