import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const IDEAS_COMMANDS = [
  {
    name: 'ideas',
    description: 'Управление идеями и предложениями клана',
    options: [
      {
        name: 'panel',
        description: 'Опубликовать панель «Идеи и предложения» с кнопкой подачи',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'set-channel',
        description: 'Указать канал, куда публиковать идеи (с голосованием и веткой)',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel',
            description: 'Канал для публикации идей (например #предложения)',
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText],
            required: true,
          },
        ],
      },
    ],
  },
];

export const IDEA_OPEN_MODAL_ID = 'idea:open_modal';
export const IDEA_SUBMIT_MODAL_ID = 'idea:submit_modal';
export const IDEA_VOTE_PREFIX = 'idea:vote:';

export function buildIdeasPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('💡 Идеи и предложения')
    .setDescription(
      'Предложите изменение или новую возможность для развития клана. После публикации участники смогут проголосовать.',
    );

  const button = new ButtonBuilder()
    .setCustomId(IDEA_OPEN_MODAL_ID)
    .setLabel('Предложить идею')
    .setEmoji('💡')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)],
  };
}

export function buildIdeaModal() {
  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Суть идеи / Название')
    .setPlaceholder('Например: Организовать клановый турнир или добавить тир-лист')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(100);

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Подробное описание')
    .setPlaceholder('Опишите вашу идею, почему это полезно и как это лучше сделать...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  return new ModalBuilder()
    .setCustomId(IDEA_SUBMIT_MODAL_ID)
    .setTitle('Предложить идею')
    .addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(contentInput),
    );
}

export function buildIdeaMessagePayload({ idea, yesCount = 0, noCount = 0, guildName = '2pz' }) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`💡 Идея: ${idea.title}`)
    .setDescription(idea.content)
    .addFields({ name: '👤 Автор', value: `<@${idea.user_id}>`, inline: true })
    .setFooter({
      text: `Создано @${idea.username} | ${guildName} • Голосование`,
    })
    .setTimestamp(new Date(idea.created_at || Date.now()));

  const yesBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_VOTE_PREFIX}yes:${idea.id}`)
    .setLabel(String(yesCount))
    .setEmoji('✅')
    .setStyle(ButtonStyle.Secondary);

  const noBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_VOTE_PREFIX}no:${idea.id}`)
    .setLabel(String(noCount))
    .setEmoji('❌')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)],
  };
}

export function createIdeasManager({ db, client, servers }) {
  const isStaff = (member, server) => {
    if (!server) return false;
    const roles = Array.isArray(member?.roles)
      ? member.roles
      : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds?.includes(id));
  };

  const serverByGuild = new Map(servers.map((s) => [s.guildId, s]));

  const replyEphemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  async function handleCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      const channel = interaction.channel;
      await channel.send(buildIdeasPanelPayload());
      return replyEphemeral(interaction, 'Панель «Идеи и предложения» успешно опубликована!');
    }

    if (sub === 'set-channel') {
      const targetChannel = interaction.options.getChannel('channel', true);
      await db.setIdeaSettings(interaction.guildId, { ideasChannelId: targetChannel.id });
      return replyEphemeral(
        interaction,
        `Канал для публикации идей успешно установлен на <#${targetChannel.id}>! Теперь новые идеи будут появляться там с веткой для обсуждения.`,
      );
    }
  }

  async function handleOpenModal(interaction) {
    return interaction.showModal(buildIdeaModal());
  }

  async function handleSubmitModal(interaction, server) {
    const title = interaction.fields.getTextInputValue('title').trim();
    const content = interaction.fields.getTextInputValue('content').trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Определяем канал для публикации: сначала из настроек БД, затем из servers.json, иначе текущий
    const settings = await db.getIdeaSettings(interaction.guildId).catch(() => null);
    const targetChannelId = settings?.ideas_channel_id || server?.ideasChannelId || interaction.channelId;

    let targetChannel = null;
    try {
      targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
    } catch {}

    if (!targetChannel) {
      targetChannel = interaction.channel;
    }

    // Сохраняем идею в базу данных
    const idea = await db.createIdea({
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      title,
      content,
    });

    // Отправляем сообщение с идеей и кнопками голосования
    const payload = buildIdeaMessagePayload({
      idea,
      yesCount: 0,
      noCount: 0,
      guildName: interaction.guild?.name || '2pz',
    });

    const ideaMessage = await targetChannel.send(payload);

    // Создаём ветку (thread) под сообщением идеи для обсуждений соклановцами
    let thread = null;
    try {
      if (typeof ideaMessage.startThread === 'function') {
        thread = await ideaMessage.startThread({
          name: `💡・${title.slice(0, 80)}`,
          autoArchiveDuration: 1440,
        });

        await thread.send({
          content: `👋 В этой ветке можно обсудить идею **«${title}»** от <@${interaction.user.id}> и предложить свои мысли!`,
        });
      }
    } catch (err) {
      console.warn('Не удалось создать ветку для обсуждения идеи:', err.message);
    }

    // Привязываем сообщение и ветку к идее
    await db.setIdeaMessageAndThread(idea.id, ideaMessage.id, thread?.id || null);

    const link = thread?.id ? `<#${thread.id}>` : `<#${targetChannel.id}>`;
    return interaction.editReply(`💡 Ваша идея успешно опубликована: ${link}! Теперь участники могут голосовать и обсуждать её.`);
  }

  async function handleVote(interaction) {
    const customId = interaction.customId; // idea:vote:yes:123
    const match = customId.slice(IDEA_VOTE_PREFIX.length).match(/^(yes|no):(\d+)$/);
    if (!match) return;

    const [, voteType, ideaIdStr] = match;
    const ideaId = Number(ideaIdStr);

    const idea = await db.getIdea(ideaId);
    if (!idea) {
      return replyEphemeral(interaction, 'Идея не найдена или была удалена.');
    }

    const res = await db.voteIdea(ideaId, interaction.user.id, voteType);
    const counts = await db.getIdeaVotesCount(ideaId);

    // Обновляем счётчики на сообщении
    const yesBtn = new ButtonBuilder()
      .setCustomId(`${IDEA_VOTE_PREFIX}yes:${idea.id}`)
      .setLabel(String(counts.yes))
      .setEmoji('✅')
      .setStyle(ButtonStyle.Secondary);

    const noBtn = new ButtonBuilder()
      .setCustomId(`${IDEA_VOTE_PREFIX}no:${idea.id}`)
      .setLabel(String(counts.no))
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary);

    await interaction.message.edit({
      components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)],
    }).catch(() => {});

    if (res.action === 'voted') {
      return replyEphemeral(
        interaction,
        `Ваш голос учтён: ${voteType === 'yes' ? '✅ **За**' : '❌ **Против**'}!`,
      );
    }

    return replyEphemeral(interaction, 'Вы отменили свой голос.');
  }

  return {
    async handleInteraction(interaction) {
      const server = serverByGuild.get(interaction.guildId);

      if (interaction.isChatInputCommand() && interaction.commandName === 'ideas') {
        if (!server) {
          await replyEphemeral(interaction, 'Бот не настроен для этого сервера.');
          return true;
        }
        await handleCommand(interaction, server);
        return true;
      }

      if (interaction.isButton()) {
        if (interaction.customId === IDEA_OPEN_MODAL_ID) {
          await handleOpenModal(interaction);
          return true;
        }
        if (interaction.customId.startsWith(IDEA_VOTE_PREFIX)) {
          await handleVote(interaction);
          return true;
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === IDEA_SUBMIT_MODAL_ID) {
          await handleSubmitModal(interaction, server);
          return true;
        }
      }

      return false;
    },
  };
}
