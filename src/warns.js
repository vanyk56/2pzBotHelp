import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { sendWarnLog } from './ticket-logs.js';

export const WARN_COMMANDS = [
  {
    name: 'warn',
    description: 'Выдать предупреждение (варн) игроку',
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
      {
        name: 'duration',
        description: 'Срок действия в днях (например 7, 7d, 14, 30. По умолчанию: 7d)',
        type: ApplicationCommandOptionType.String,
        required: false,
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

export function parseDurationDays(str) {
  if (!str || typeof str !== 'string') return 7;
  const match = str.trim().match(/^(\d+)/);
  if (!match) return 7;
  const num = parseInt(match[1], 10);
  if (Number.isNaN(num) || num < 1) return 7;
  if (num > 365) return 365;
  return num;
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
    const durationInput = interaction.options.getString('duration');
    const durationDays = parseDurationDays(durationInput);

    if (targetUser.bot) {
      return replyEphemeral(interaction, 'Ботам нельзя выдавать варны.');
    }

    await interaction.deferReply();

    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    const warn = await db.addWarn({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      durationDays,
      expiresAt,
    });

    const activeWarns = await db.getActiveWarns(interaction.guildId, targetUser.id);
    const activeCount = activeWarns.length;

    let sanctionNote = null;
    let member = null;
    try {
      member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    } catch {}

    // Авто-санкция при 3/3 активных варнах
    if (activeCount >= 3) {
      const sanctionParts = [];
      if (server.acceptedRoleId && member?.roles?.cache?.has(server.acceptedRoleId)) {
        try {
          await member.roles.remove(server.acceptedRoleId, '3/3 активных варнов');
          sanctionParts.push(`роль клана <@&${server.acceptedRoleId}> снята`);
        } catch (err) {
          console.warn('Не удалось снять роль клана при 3/3 варнах:', err.message);
        }
      }

      if (member) {
        try {
          // 7 дней таймаута
          const timeoutMs = 7 * 24 * 60 * 60 * 1000;
          await member.timeout(timeoutMs, '3/3 активных варнов');
          sanctionParts.push('выдан таймаут на 7 дней');
        } catch (err) {
          console.warn('Не удалось выдать таймаут при 3/3 варнах:', err.message);
        }
      }

      if (sanctionParts.length > 0) {
        sanctionNote = `🚨 Достигнут лимит 3/3 варнов: ${sanctionParts.join(', ')}!`;
      } else {
        sanctionNote = '🚨 Достигнут лимит 3/3 варнов!';
      }
    }

    // Отправка в ЛС игроку
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(activeCount >= 3 ? 0xed4245 : 0xfee75c)
        .setTitle(`⚠️ Вам выдан варн на сервере ${interaction.guild.name}`)
        .addFields(
          { name: '💬 Причина', value: reason, inline: false },
          { name: '⏱️ Срок', value: `${durationDays} дн. (до <t:${Math.floor(expiresAt.getTime() / 1000)}:f>)`, inline: true },
          { name: '📊 Активных варнов', value: `**${activeCount}/3**`, inline: true },
        )
        .setFooter({ text: 'При накоплении 3 варнов роль клана снимается. Вы можете обжаловать варн через тикет.' })
        .setTimestamp(new Date());

      if (sanctionNote) {
        dmEmbed.addFields({ name: '🚨 Применённые санкции', value: sanctionNote, inline: false });
      }

      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // Игнорируем закрытые ЛС
    }

    // Логирование в #тикет-логи
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

    const replyEmbed = new EmbedBuilder()
      .setColor(activeCount >= 3 ? 0xed4245 : 0xfee75c)
      .setTitle(`⚠️ Выдан варн #${warn.id}`)
      .setDescription(
        `Игроку <@${targetUser.id}> успешно выдан варн (**${activeCount}/3**).\n\n` +
          `• **Причина:** ${reason}\n` +
          `• **Срок:** ${durationDays} дн. (до <t:${Math.floor(expiresAt.getTime() / 1000)}:f>)\n` +
          `• **Модератор:** <@${interaction.user.id}>` +
          (sanctionNote ? `\n\n${sanctionNote}` : ''),
      );

    return interaction.editReply({ embeds: [replyEmbed] });
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

    // Оповещение в ЛС
    try {
      const userObj = await client.users.fetch(targetUserId).catch(() => null);
      if (userObj) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`✅ С вас снят варн на сервере ${interaction.guild.name}`)
          .setDescription(`Варн #${removedWarn.id} был досрочно снят.\n**Причина снятия:** ${reason}\n**Осталось активных варнов:** ${activeCount}/3`)
          .setTimestamp(new Date());
        await userObj.send({ embeds: [dmEmbed] });
      }
    } catch {}

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

    const replyEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`✅ Снят варн #${removedWarn.id}`)
      .setDescription(
        `С игрока <@${targetUserId}> успешно снят варн #${removedWarn.id}.\n` +
          `• **Причина снятия:** ${reason}\n` +
          `• **Осталось активных варнов:** **${activeCount}/3**\n` +
          `• **Модератор:** <@${interaction.user.id}>`,
      );

    return interaction.editReply({ embeds: [replyEmbed] });
  }

  async function handleWarns(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const targetUser = interaction.options.getUser('user', true);
    await interaction.deferReply();

    const allWarns = await db.getAllWarns(interaction.guildId, targetUser.id);
    const activeWarns = allWarns.filter(
      (w) => w.active && new Date(w.expires_at).getTime() > Date.now(),
    );

    const embed = new EmbedBuilder()
      .setColor(activeWarns.length >= 3 ? 0xed4245 : activeWarns.length > 0 ? 0xfee75c : 0x57f287)
      .setTitle(`📋 История предупреждений: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `👤 Игрок: <@${targetUser.id}>\n` +
          `⚠️ Активных варнов: **${activeWarns.length}/3**\n` +
          `📜 Всего получено: **${allWarns.length}**\n\n` +
          (allWarns.length === 0
            ? '✅ У игрока нет предупреждений.'
            : allWarns
                .slice(0, 10)
                .map((w) => {
                  const isActive = w.active && new Date(w.expires_at).getTime() > Date.now();
                  const status = isActive
                    ? '🔴 **Активен**'
                    : w.unwarned_at
                      ? '🟢 **Снят**'
                      : '⚪ *Истёк*';
                  const expUnix = Math.floor(new Date(w.expires_at).getTime() / 1000);
                  const createdUnix = Math.floor(new Date(w.created_at).getTime() / 1000);
                  return (
                    `**#${w.id}** [${status}] — *«${w.reason}»*\n` +
                    `└ Выдан: <t:${createdUnix}:d> (<@${w.moderator_id}>) · Истекает: <t:${expUnix}:R>` +
                    (w.unwarn_reason ? ` · Снял: <@${w.unwarned_by}> (*${w.unwarn_reason}*)` : '')
                  );
                })
                .join('\n\n')),
      )
      .setFooter({ text: 'Максимум 3 активных варна перед снятием роли' })
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
