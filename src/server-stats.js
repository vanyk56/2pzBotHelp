import {
  ApplicationCommandOptionType,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';

export function formatStatsNames(total, online) {
  return {
    categoryName: '📊 SERVER STATS 📊',
    totalName: `MEMBERS: ${total}`,
    onlineName: `ONLINE: ${online}`,
  };
}

export const STATS_COMMAND = {
  name: 'stats',
  description: 'Управление счётчиками статистики сервера (участники и онлайн)',
  options: [
    {
      name: 'update',
      description: 'Принудительно обновить счётчики участников и онлайна',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'setup',
      description: 'Создать или пересоздать категорию и каналы со статистикой сервера',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
};

export const STATS_COMMANDS = [STATS_COMMAND];

export function createServerStats({ client, db, servers, intervalMs = 10 * 60 * 1000 }) {
  let timer = null;

  function isStaff(member, server) {
    if (!server?.staffRoleIds || !member?.roles?.cache) return false;
    return server.staffRoleIds.some((id) => member.roles.cache.has(id));
  }

  function getStatsServer(guildId) {
    return servers.find((s) => s.guildId === guildId && (s.stats === true || s.guildId === '1424464968438382767'));
  }

  async function syncGuildStats(guild) {
    if (!guild) return null;

    let total = guild.memberCount ?? 0;
    let online = 0;

    try {
      const fullGuild = await guild.fetch({ withCounts: true }).catch(() => null);
      if (fullGuild?.approximateMemberCount) {
        total = fullGuild.approximateMemberCount;
      }
      if (fullGuild?.approximatePresenceCount !== undefined) {
        online = fullGuild.approximatePresenceCount;
      }
    } catch (err) {
      console.warn(`Не удалось запросить withCounts для ${guild.name}:`, err.message);
    }

    if (online === 0 && guild.members?.cache?.size > 0) {
      online = guild.members.cache.filter(
        (m) => m.presence?.status && m.presence.status !== 'offline',
      ).size;
    }

    const { categoryName, totalName, onlineName } = formatStatsNames(total, online);

    const saved = await db.getServerStatsSettings(guild.id).catch(() => null);

    let category = saved?.category_id
      ? await guild.channels.fetch(saved.category_id).catch(() => null)
      : null;
    let totalChannel = saved?.total_channel_id
      ? await guild.channels.fetch(saved.total_channel_id).catch(() => null)
      : null;
    let onlineChannel = saved?.online_channel_id
      ? await guild.channels.fetch(saved.online_channel_id).catch(() => null)
      : null;

    // Если в БД не было, пробуем найти среди существующих каналов
    const allChannels = await guild.channels.fetch().catch(() => null);
    if (allChannels) {
      if (!category) {
        category = allChannels.find(
          (c) => c && c.type === ChannelType.GuildCategory && c.name.includes('SERVER STATS'),
        );
      }
      if (!totalChannel) {
        totalChannel = allChannels.find(
          (c) => c && c.type === ChannelType.GuildVoice && /^MEMBERS:/i.test(c.name),
        );
      }
      if (!onlineChannel) {
        onlineChannel = allChannels.find(
          (c) => c && c.type === ChannelType.GuildVoice && /^ONLINE:/i.test(c.name),
        );
      }
    }

    const everyoneRole = guild.roles.everyone;
    const voicePerms = [
      {
        id: everyoneRole.id,
        deny: [PermissionFlagsBits.Connect],
        allow: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.Connect,
        ],
      },
    ];

    // Создаём категорию, если её нет
    if (!category) {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        position: 0,
      });
    }

    // Создаём или обновляем канал Всего участников
    if (!totalChannel) {
      totalChannel = await guild.channels.create({
        name: totalName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: voicePerms,
      });
    } else {
      if (totalChannel.parentId !== category.id) {
        await totalChannel.setParent(category.id).catch(() => {});
      }
      if (totalChannel.name !== totalName) {
        await totalChannel.setName(totalName).catch((err) => {
          if (err.code !== 50035 && err.status !== 429) {
            console.warn('Не удалось обновить totalChannel:', err.message);
          }
        });
      }
    }

    // Создаём или обновляем канал Онлайн
    if (!onlineChannel) {
      onlineChannel = await guild.channels.create({
        name: onlineName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: voicePerms,
      });
    } else {
      if (onlineChannel.parentId !== category.id) {
        await onlineChannel.setParent(category.id).catch(() => {});
      }
      if (onlineChannel.name !== onlineName) {
        await onlineChannel.setName(onlineName).catch((err) => {
          if (err.code !== 50035 && err.status !== 429) {
            console.warn('Не удалось обновить onlineChannel:', err.message);
          }
        });
      }
    }

    // Сохраняем в БД
    await db.setServerStatsSettings(guild.id, {
      categoryId: category.id,
      totalChannelId: totalChannel.id,
      onlineChannelId: onlineChannel.id,
    }).catch((err) => console.error('Ошибка сохранения server_stats:', err));

    return {
      category,
      totalChannel,
      onlineChannel,
      total,
      online,
    };
  }

  async function updateAll() {
    for (const server of servers) {
      if (server.stats === true || server.guildId === '1424464968438382767') {
        try {
          const guild = await client.guilds.fetch(server.guildId).catch(() => null);
          if (guild) {
            await syncGuildStats(guild);
          }
        } catch (err) {
          console.error(`Ошибка обновления статистики для ${server.name}:`, err.message);
        }
      }
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName !== 'stats') return false;

    const server = getStatsServer(interaction.guildId);
    if (!isStaff(interaction.member, server)) {
      await interaction.reply({ content: 'Команда только для модерации.', flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await syncGuildStats(interaction.guild);
      if (!result) {
        await interaction.editReply('❌ Не удалось обновить статистику сервера.');
        return true;
      }

      await interaction.editReply(
        `✅ **Статистика сервера обновлена:**\n` +
        `• Категория: **${result.category.name}**\n` +
        `• 🔒 **Участников:** ${result.total} (<#${result.totalChannel.id}>)\n` +
        `• 🔒 **В сети:** ${result.online} (<#${result.onlineChannel.id}>)`,
      );
      return true;
    } catch (err) {
      console.error('Ошибка команды /stats:', err);
      await interaction.editReply(`❌ Ошибка обновления статистики: ${err.message}`);
      return true;
    }
  }

  return {
    start() {
      updateAll();
      timer = setInterval(updateAll, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
    },
    syncGuildStats,
    handleInteraction,
  };
}
