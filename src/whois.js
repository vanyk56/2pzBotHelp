import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { formatSteam, formatTelegram } from './profiles.js';
import { checkSteamAccount } from './steam.js';

export const WHOIS_COMMAND = {
  name: 'whois',
  description: 'Полное досье на игрока (профиль, тикеты, варны, Steam, Telegram)',
  options: [
    {
      name: 'user',
      description: 'Игрок для просмотра досье',
      type: ApplicationCommandOptionType.User,
      required: true,
    },
  ],
};

export function buildWhoisEmbed({
  targetUser,
  member,
  profile,
  warns = [],
  tickets = [],
  steamCheck = null,
  guildId,
}) {
  const activeWarns = warns.filter(
    (w) => w.active && new Date(w.expires_at).getTime() > Date.now(),
  );

  const isAccepted = Boolean(profile);
  const color = activeWarns.length >= 3 ? 0xed4245 : isAccepted ? 0x57f287 : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`👤 Досье игрока: ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(
      `**Упоминание:** <@${targetUser.id}>\n` +
        `**ID пользователя:** \`${targetUser.id}\`\n` +
        `**Статус в клане:** ${isAccepted ? '✅ **Принят в клан**' : '⚪ *Не состоит в базе*'}\n`,
    )
    .setTimestamp(new Date());

  // Данные принятого игрока
  if (profile) {
    const acceptedUnix = profile.created_at
      ? Math.floor(new Date(profile.created_at).getTime() / 1000)
      : null;
    const acceptedByText = profile.accepted_by ? `<@${profile.accepted_by}>` : '*неизвестно*';
    const dateText = acceptedUnix ? `<t:${acceptedUnix}:D>` : '*неизвестно*';

    embed.addFields({
      name: '🛡️ Данные соклановца',
      value:
        `• **Имя:** ${profile.real_name || '*не указано*'}\n` +
        `• **Часы в анкете:** ${profile.hours || '*не указано*'}\n` +
        `• **Принят:** ${dateText} (${acceptedByText})\n` +
        (profile.ticket_id ? `• **Тикет приёма:** #${profile.ticket_id}` : ''),
      inline: false,
    });
  }

  // Контакты (Steam и Telegram)
  let steamField = formatSteam(profile?.steam);
  if (steamCheck?.found) {
    const hoursText =
      steamCheck.rustHours !== null ? ` · Rust: **${steamCheck.rustHours} ч.**` : '';
    const banText = steamCheck.vacBanned ? ' · 🚨 **VAC-бан!**' : ' · ✅ Чисто';
    steamField += `${hoursText}${banText}`;
  }

  embed.addFields(
    { name: '🎮 Steam', value: steamField, inline: true },
    { name: '✈️ Telegram', value: formatTelegram(profile?.telegram), inline: true },
  );

  // Варны
  let warnsValue = `Активных: **${activeWarns.length}/3** (всего получено: ${warns.length})`;
  if (activeWarns.length > 0) {
    const warnList = activeWarns
      .slice(0, 3)
      .map((w) => {
        const expUnix = Math.floor(new Date(w.expires_at).getTime() / 1000);
        return `• **#${w.id}**: «${w.reason}» (до <t:${expUnix}:R>)`;
      })
      .join('\n');
    warnsValue += `\n${warnList}`;
  }
  embed.addFields({ name: '⚠️ Предупреждения (Варны)', value: warnsValue, inline: false });

  // История тикетов
  let ticketsValue = `Всего создано заявок: **${tickets.length}**`;
  if (tickets.length > 0) {
    const ticketList = tickets
      .slice(0, 4)
      .map((t) => {
        const createdUnix = Math.floor(new Date(t.created_at).getTime() / 1000);
        const statusEmoji = t.status === 'open' ? '🟢' : t.status === 'closed' ? '🔒' : '⏳';
        return `• #${t.id} ${statusEmoji} **${t.ticket_type}** (<t:${createdUnix}:d>)`;
      })
      .join('\n');
    ticketsValue += `\n${ticketList}`;
  }
  embed.addFields({ name: '🎫 История тикетов', value: ticketsValue, inline: false });

  // Discord инфо
  const createdDiscordUnix = Math.floor(targetUser.createdAt.getTime() / 1000);
  const joinedGuildUnix = member?.joinedAt
    ? Math.floor(member.joinedAt.getTime() / 1000)
    : null;

  const roles = member?.roles?.cache
    ?.filter((r) => r.id !== guildId)
    .map((r) => `<@&${r.id}>`)
    .slice(0, 8)
    .join(' ');

  embed.addFields({
    name: '📅 Discord',
    value:
      `• **Регистрация в Discord:** <t:${createdDiscordUnix}:R>\n` +
      `• **На этом сервере:** ${joinedGuildUnix ? `<t:${joinedGuildUnix}:R>` : '*не на сервере*'}\n` +
      `• **Роли:** ${roles || '*нет ролей*'}`,
    inline: false,
  });

  return embed;
}

export function createWhoisManager({ db, client, servers, steamApiKey }) {
  const isStaff = (member, server) => {
    if (!server) return false;
    const roles = Array.isArray(member?.roles)
      ? member.roles
      : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds?.includes(id));
  };

  const serverByGuild = new Map(servers.map((s) => [s.guildId, s]));

  return {
    async handleInteraction(interaction) {
      if (!interaction.isChatInputCommand()) return false;
      if (interaction.commandName !== 'whois') return false;

      const server = serverByGuild.get(interaction.guildId);
      if (!server) {
        await interaction.reply({
          content: 'Бот не настроен для этого сервера.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (!isStaff(interaction.member, server)) {
        await interaction.reply({
          content: 'Команда доступна только модерации.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const targetUser = interaction.options.getUser('user', true);
      await interaction.deferReply();

      let member = null;
      try {
        member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      } catch {}

      const [profile, warns, tickets] = await Promise.all([
        db.getUserProfile(interaction.guildId, targetUser.id).catch(() => null),
        db.getAllWarns(interaction.guildId, targetUser.id).catch(() => []),
        db.getUserTickets(targetUser.id).catch(() => []),
      ]);

      let steamCheck = null;
      if (profile?.steam && steamApiKey) {
        try {
          steamCheck = await checkSteamAccount(profile.steam, steamApiKey);
        } catch {}
      }

      const embed = buildWhoisEmbed({
        targetUser,
        member,
        profile,
        warns,
        tickets,
        steamCheck,
        guildId: interaction.guildId,
      });

      await interaction.editReply({ embeds: [embed] });
      return true;
    },
  };
}
