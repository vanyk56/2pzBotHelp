import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
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
      {
        name: 'decide',
        description: 'Принять решение по идее (внутри её ветки или указав ID)',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'status',
            description: 'Решение по идее',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
              { name: '✅ Одобрить идею', value: 'accepted' },
              { name: '❌ Отклонить идею', value: 'rejected' },
            ],
          },
          {
            name: 'reason',
            description: 'Причина или комментарий администрации (будет отправлен автору и в ветку)',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: 'idea_id',
            description: 'ID идеи (необязательно, если команда вызвана внутри ветки идеи)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
          },
        ],
      },
    ],
  },
];

export const IDEA_OPEN_MODAL_ID = 'idea:open_modal';
export const IDEA_SUBMIT_MODAL_ID = 'idea:submit_modal';
export const IDEA_VOTE_PREFIX = 'idea:vote:';
export const IDEA_DECIDE_PREFIX = 'idea:decide:';
export const IDEA_DECIDE_MODAL_PREFIX = 'idea:modal_decide:';

export function buildIdeasPanelPayload(guild = null) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('💡 Идеи и предложения')
    .setDescription(
      'Предложите изменение или новую возможность для развития клана. После публикации участники смогут проголосовать.',
    );

  const customEmoji = guild?.emojis?.cache?.find((e) => e.name === '2pz_idea');

  const button = new ButtonBuilder()
    .setCustomId(IDEA_OPEN_MODAL_ID)
    .setLabel('Предложить идею')
    .setStyle(ButtonStyle.Primary);

  if (customEmoji) {
    button.setEmoji(customEmoji.id);
  } else {
    button.setEmoji('💡');
  }

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

export function buildIdeaThreadDecideRow(ideaId) {
  const acceptBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_DECIDE_PREFIX}accepted:${ideaId}`)
    .setLabel('Одобрить')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_DECIDE_PREFIX}rejected:${ideaId}`)
    .setLabel('Отклонить')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(acceptBtn, rejectBtn);
}

export function buildIdeaDecisionModal(status, ideaId) {
  const isAccepted = status === 'accepted';
  const noteInput = new TextInputBuilder()
    .setCustomId('decision_note')
    .setLabel(isAccepted ? 'Комментарий (необязательно)' : 'Причина отклонения (необязательно)')
    .setPlaceholder(
      isAccepted
        ? 'Например: Будет добавлено в ближайшем обновлении или принято в план...'
        : 'Например: Не подходит для текущего формата клана или отклонено голосованием...',
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  return new ModalBuilder()
    .setCustomId(`${IDEA_DECIDE_MODAL_PREFIX}${status}:${ideaId}`)
    .setTitle(isAccepted ? 'Одобрить идею' : 'Отклонить идею')
    .addComponents(new ActionRowBuilder().addComponents(noteInput));
}

export function buildDecidedIdeaMessagePayload({
  idea,
  status,
  decidedBy,
  decisionNote = null,
  counts = { yes: 0, no: 0 },
  guildName = '2pz',
}) {
  const isAccepted = status === 'accepted';
  const embed = new EmbedBuilder()
    .setColor(isAccepted ? 0x57f287 : 0xed4245)
    .setTitle(`${isAccepted ? '🟢 ОДОБРЕНО' : '🔴 ОТКЛОНЕНО'}: ${idea.title}`)
    .setDescription(idea.content)
    .addFields(
      { name: '👤 Автор', value: `<@${idea.user_id}>`, inline: true },
      { name: '🛡️ Статус', value: isAccepted ? '✅ **Одобрено**' : '❌ **Отклонено**', inline: true },
      { name: '⚖️ Решение принял', value: `<@${decidedBy}>`, inline: true },
    );

  if (decisionNote) {
    embed.addFields({
      name: isAccepted ? '💬 Комментарий' : '📋 Причина',
      value: decisionNote,
      inline: false,
    });
  }

  embed.addFields({
    name: '📊 Итоги голосования',
    value: `✅ **${counts.yes}** за • ❌ **${counts.no}** против`,
    inline: false,
  });

  embed
    .setFooter({
      text: `Идея #${idea.id} | ${isAccepted ? 'Одобрена' : 'Отклонена'} | ${guildName}`,
    })
    .setTimestamp(new Date(idea.created_at || Date.now()));

  const yesBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_VOTE_PREFIX}yes:${idea.id}`)
    .setLabel(String(counts.yes))
    .setEmoji('✅')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const noBtn = new ButtonBuilder()
    .setCustomId(`${IDEA_VOTE_PREFIX}no:${idea.id}`)
    .setLabel(String(counts.no))
    .setEmoji('❌')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)],
  };
}

export function createIdeasManager({ db, client, servers }) {
  const isStaff = (member, server) => {
    if (!server) return false;
    if (member?.permissions?.has && member.permissions.has('Administrator')) return true;
    const roles = Array.isArray(member?.roles)
      ? member.roles
      : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds?.includes(id));
  };

  const serverByGuild = new Map(servers.map((s) => [s.guildId, s]));

  const replyEphemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  async function ensureIdeasChannelPermissions(channel, server = null) {
    if (!channel || !channel.permissionOverwrites) return;
    const everyoneRole = channel.guild?.roles?.everyone;
    if (!everyoneRole) return;

    try {
      await channel.permissionOverwrites.create(
        everyoneRole.id,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
          SendMessagesInThreads: true,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          AttachFiles: true,
          EmbedLinks: true,
          AddReactions: true,
          UseExternalEmojis: true,
        },
        { reason: 'Настройка прав канала идей: участники могут писать в ветках' },
      );

      if (server?.staffRoleIds?.length > 0) {
        for (const roleId of server.staffRoleIds) {
          await channel.permissionOverwrites.create(
            roleId,
            {
              ViewChannel: true,
              ReadMessageHistory: true,
              SendMessages: true,
              SendMessagesInThreads: true,
              ManageMessages: true,
              ManageThreads: true,
              AttachFiles: true,
              EmbedLinks: true,
              AddReactions: true,
              UseExternalEmojis: true,
            },
            { reason: 'Права модерации для канала идей' },
          ).catch(() => {});
        }
      }
      console.log(`Права на канал идей «${channel.name}» успешно настроены: участники могут писать в ветках.`);
    } catch (err) {
      console.warn(`Не удалось обновить права канала идей «${channel.name}»:`, err.message);
    }
  }

  async function ensureAllIdeaPermissions() {
    try {
      const allSettings = (await db.getAllIdeaSettings?.().catch(() => [])) || [];
      const channelIds = new Set();
      for (const row of allSettings) {
        if (row.ideas_channel_id) channelIds.add(row.ideas_channel_id);
      }
      for (const s of servers) {
        if (s.ideasChannelId) channelIds.add(s.ideasChannelId);
      }

      for (const channelId of channelIds) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          const server = serverByGuild.get(channel.guild?.id);
          await ensureIdeasChannelPermissions(channel, server);
        }
      }

      const openIdeas = (await db.findOpenIdeas?.().catch(() => [])) || [];
      for (const idea of openIdeas) {
        if (!idea.thread_id) continue;
        const thread = await client.channels.fetch(idea.thread_id).catch(() => null);
        if (!thread || thread.locked || thread.archived) continue;

        if (idea.user_id && thread.members?.add) {
          await thread.members.add(idea.user_id).catch(() => {});
        }

        const parent =
          thread.parent ??
          (thread.parentId ? await thread.guild?.channels?.fetch(thread.parentId).catch(() => null) : null);
        if (parent && !channelIds.has(parent.id)) {
          channelIds.add(parent.id);
          const server = serverByGuild.get(parent.guild?.id);
          await ensureIdeasChannelPermissions(parent, server);
        }
      }
    } catch (err) {
      console.warn('Ошибка при проверке прав каналов и веток идей:', err.message);
    }
  }

  async function applyIdeaDecision({
    interaction,
    ideaId,
    status,
    decisionNote = null,
    server,
  }) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const idea = await db.getIdea(ideaId);
    if (!idea) {
      return interaction.editReply('❌ Идея не найдена в базе данных.');
    }

    if (idea.status !== 'open') {
      const current = idea.status === 'accepted' ? 'одобрена' : 'отклонена';
      return interaction.editReply(`⚠️ По этой идее уже вынесено решение: идея **${current}**.`);
    }

    await db.setIdeaStatus(idea.id, status, interaction.user.id, decisionNote || null);
    const counts = await db.getIdeaVotesCount(idea.id);

    // 1. Обновляем главное сообщение в канале идей
    try {
      const channel = await client.channels.fetch(idea.channel_id).catch(() => null);
      if (channel && idea.message_id) {
        const msg = await channel.messages.fetch(idea.message_id).catch(() => null);
        if (msg) {
          const payload = buildDecidedIdeaMessagePayload({
            idea,
            status,
            decidedBy: interaction.user.id,
            decisionNote,
            counts,
            guildName: interaction.guild?.name || '2pz',
          });
          await msg.edit(payload).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Не удалось обновить главное сообщение идеи:', err.message);
    }

    // 2. Публикуем вердикт в ветке обсуждения, затем блокируем и архивируем её
    if (idea.thread_id) {
      try {
        const thread = await client.channels.fetch(idea.thread_id).catch(() => null);
        if (thread) {
          const isAccepted = status === 'accepted';
          const threadEmbed = new EmbedBuilder()
            .setColor(isAccepted ? 0x57f287 : 0xed4245)
            .setTitle(isAccepted ? '✅ Идея официально одобрена!' : '❌ Идея официально отклонена')
            .setDescription(
              isAccepted
                ? `Администрация одобрила данное предложение! Спасибо за вклад в развитие клана.`
                : `Администрация рассмотрела данное предложение и приняла решение отклонить его.`,
            )
            .addFields(
              { name: '⚖️ Решение принял', value: `<@${interaction.user.id}>`, inline: true },
              { name: '📊 Итоги голосования', value: `✅ ${counts.yes} • ❌ ${counts.no}`, inline: true },
            );

          if (decisionNote) {
            threadEmbed.addFields({
              name: isAccepted ? '💬 Комментарий' : '📋 Причина',
              value: decisionNote,
              inline: false,
            });
          }

          threadEmbed.setFooter({ text: 'Ветка закрыта и заблокирована от новых сообщений.' });

          await thread.send({ embeds: [threadEmbed] }).catch(() => {});
          if (typeof thread.setLocked === 'function') {
            await thread.setLocked(true).catch(() => {});
          }
          if (typeof thread.setArchived === 'function') {
            await thread.setArchived(true).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Не удалось закрыть ветку идеи:', err.message);
      }
    }

    // 3. Отправляем уведомление автору идеи в ЛС
    try {
      const author = await client.users.fetch(idea.user_id).catch(() => null);
      if (author) {
        const isAccepted = status === 'accepted';
        const authorEmbed = new EmbedBuilder()
          .setColor(isAccepted ? 0x57f287 : 0xed4245)
          .setTitle(isAccepted ? '✅ Ваша идея была одобрена!' : '❌ Ваша идея была отклонена')
          .setDescription(
            `Ваша идея **«${idea.title}»** на сервере **${interaction.guild?.name || '2pz'}** была рассмотрена модерацией.`,
          )
          .addFields(
            { name: '⚖️ Статус', value: isAccepted ? '✅ Одобрено' : '❌ Отклонено', inline: true },
            { name: '🛡️ Модератор', value: `<@${interaction.user.id}>`, inline: true },
          );

        if (decisionNote) {
          authorEmbed.addFields({
            name: isAccepted ? '💬 Комментарий' : '📋 Причина',
            value: decisionNote,
            inline: false,
          });
        }

        await author.send({ embeds: [authorEmbed] }).catch(() => {});
      }
    } catch (err) {
      console.warn('Не удалось отправить ЛС автору идеи:', err.message);
    }

    const verdictLabel = status === 'accepted' ? 'одобрена' : 'отклонена';
    return interaction.editReply(
      `✅ Решение вынесено: идея #${idea.id} («${idea.title}») успешно **${verdictLabel}**! Голосование завершено, ветка закрыта, автор получил уведомление в ЛС.`,
    );
  }

  async function handleCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Команда доступна только модерации.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      const channel = interaction.channel;
      await channel.send(buildIdeasPanelPayload(interaction.guild));
      return replyEphemeral(interaction, 'Панель «Идеи и предложения» успешно опубликована!');
    }

    if (sub === 'set-channel') {
      const targetChannel = interaction.options.getChannel('channel', true);
      await db.setIdeaSettings(interaction.guildId, { ideasChannelId: targetChannel.id });
      await ensureIdeasChannelPermissions(targetChannel, server);
      return replyEphemeral(
        interaction,
        `Канал для публикации идей успешно установлен на <#${targetChannel.id}>! Права настроены: участники могут свободно обсуждать идеи в ветках.`,
      );
    }

    if (sub === 'decide') {
      const status = interaction.options.getString('status', true);
      const reason = interaction.options.getString('reason')?.trim() || null;
      let ideaId = interaction.options.getInteger('idea_id');

      if (!ideaId) {
        const found = await db.findIdeaByThread(interaction.channelId).catch(() => null);
        if (found) {
          ideaId = found.id;
        }
      }

      if (!ideaId) {
        return replyEphemeral(
          interaction,
          '⚠️ Не удалось определить идею. Если вы вызываете команду не внутри ветки идеи, укажите параметр `idea_id` (например: `/ideas decide status:accepted idea_id:1`).',
        );
      }

      return applyIdeaDecision({
        interaction,
        ideaId,
        status,
        decisionNote: reason,
        server,
      });
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
      // Убеждаемся, что права на канал настроены, чтобы участники могли писать в ветках
      await ensureIdeasChannelPermissions(targetChannel, server);

      if (typeof ideaMessage.startThread === 'function') {
        thread = await ideaMessage.startThread({
          name: `💡・${title.slice(0, 80)}`,
          autoArchiveDuration: 1440,
        });

        // Добавляем автора идеи в созданную ветку
        await thread.members.add(interaction.user.id).catch((err) =>
          console.warn('Не удалось добавить автора идеи в ветку:', err.message),
        );

        const decideRow = buildIdeaThreadDecideRow(idea.id);

        await thread.send({
          content: `👋 В этой ветке можно обсудить идею **«${title}»** от <@${interaction.user.id}> и предложить свои мысли!\n\n🛡️ **Для модерации:** Когда решите судьбу идеи, нажмите кнопку ниже или используйте \`/ideas decide\`:`,
          components: [decideRow],
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

    if (idea.status !== 'open') {
      const current = idea.status === 'accepted' ? 'одобрена' : 'отклонена';
      return replyEphemeral(
        interaction,
        `⚠️ Голосование по этой идее уже завершено (идея **${current}**).`,
      );
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

  async function handleDecideButton(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, '⚠️ Принятие решения по идеям доступно только модерации клана.');
    }

    const match = interaction.customId.slice(IDEA_DECIDE_PREFIX.length).match(/^(accepted|rejected):(\d+)$/);
    if (!match) return;

    const [, status, ideaIdStr] = match;
    const ideaId = Number(ideaIdStr);

    const idea = await db.getIdea(ideaId);
    if (!idea) {
      return replyEphemeral(interaction, '❌ Идея не найдена в базе данных.');
    }

    if (idea.status !== 'open') {
      const current = idea.status === 'accepted' ? 'одобрена' : 'отклонена';
      return replyEphemeral(interaction, `⚠️ По этой идее уже вынесено решение: идея **${current}**.`);
    }

    return interaction.showModal(buildIdeaDecisionModal(status, ideaId));
  }

  async function handleDecideModalSubmit(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, '⚠️ Принятие решения по идеям доступно только модерации клана.');
    }

    const match = interaction.customId.slice(IDEA_DECIDE_MODAL_PREFIX.length).match(/^(accepted|rejected):(\d+)$/);
    if (!match) return;

    const [, status, ideaIdStr] = match;
    const ideaId = Number(ideaIdStr);
    const note = interaction.fields.getTextInputValue('decision_note')?.trim() || null;

    return applyIdeaDecision({
      interaction,
      ideaId,
      status,
      decisionNote: note,
      server,
    });
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
        if (interaction.customId.startsWith(IDEA_DECIDE_PREFIX)) {
          await handleDecideButton(interaction, server);
          return true;
        }
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === IDEA_SUBMIT_MODAL_ID) {
          await handleSubmitModal(interaction, server);
          return true;
        }
        if (interaction.customId.startsWith(IDEA_DECIDE_MODAL_PREFIX)) {
          await handleDecideModalSubmit(interaction, server);
          return true;
        }
      }

      return false;
    },
    ensureAllIdeaPermissions,
    ensureIdeasChannelPermissions,
  };
}
