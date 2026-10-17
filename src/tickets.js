import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { buildFormModal, FORM_MODAL_ID, readAnswers, validateAnswers } from './form.js';
import { buildMessages, GREETING_REQUEST, statusTitle } from './assistant.js';
import { slugify, splitMessage } from './utils.js';

export const PANEL_BUTTON_ID = 'ticket:open';
const ACTION_PREFIX = 'ticket:act:';
const GREETING_FALLBACK =
  'Спасибо за заявку! В скором времени вас вызовут на обзвон. Если есть вопросы, пишите сюда.';
const REPLY_FALLBACK = 'Сейчас не могу ответить на ваше сообщение. Модераторы увидят его в этом канале.';
// Модель пишет это слово, когда отвечать не нужно (small talk, не по теме)
const SKIP = '<SKIP>';
// Если модератор писал в тикет за это время, ассистент молчит и не встревает в разговор
const STAFF_SILENCE_MINUTES = 15;
const DELETE_DELAY_MS = 10_000;

// Кнопки модерации под заявкой (подписи как в старом боте 2pzbot)
const STAFF_BUTTONS = [
  { action: 'accept', label: 'Принять', style: ButtonStyle.Success, status: 'accepted' },
  { action: 'review', label: 'Взять на рассмотрение', style: ButtonStyle.Secondary, status: 'in_review' },
  { action: 'call', label: 'Вызвать на обзвон', style: ButtonStyle.Primary, status: 'call' },
  { action: 'reject', label: 'Отклонить', style: ButtonStyle.Danger, status: 'closed' },
];

// Решения, которые закрывают тикет. note — текст в плашке «Тикет закрыт»
const CLOSING_DECISIONS = {
  accept: {
    verdict: 'принята',
    note: (userId) => `✅ <@${userId}>, заявка **принята**. Поздравляем!`,
  },
  reject: {
    verdict: 'отклонена',
    note: () => '❌ Заявка **отклонена**.',
  },
};

const ACTIVE_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

// Обращается ли сообщение к боту: упоминание или слово «бот» / «2pzbot» отдельно
export function addressesBot(text, botId) {
  return text.includes(`<@${botId}>`) || /(^|[^\p{L}])(бот|2pzbot)([^\p{L}]|$)/iu.test(text);
}

// Плашка при закрытии тикета; note — необязательная первая строка (например, решение модератора)
function closedEmbed(note) {
  const lines = [
    note,
    'Канал и история сообщений будут удалены через 10 секунд.',
    'Спасибо за обращение в клан 2pz! Если вопрос возникнет снова, создайте новый тикет.',
  ];
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔒 Тикет закрыт')
    .setDescription(lines.filter(Boolean).join('\n\n'));
}

export function createTicketBot({ client, db, ai, config, contextMessages }) {
  const { staffRoleIds } = config;
  // Ответы модели идут по одному на канал, чтобы не перемешивались
  const queues = new Map();

  const isStaff = (member) => {
    const roles = Array.isArray(member?.roles) ? member.roles : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => staffRoleIds.includes(id));
  };

  const replyEphemeral = (interaction, content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  function enqueue(channelId, task) {
    const previous = queues.get(channelId) ?? Promise.resolve();
    const next = previous.then(task).catch((error) => console.error('Ошибка очереди ответов:', error));
    queues.set(channelId, next);
    next.finally(() => {
      if (queues.get(channelId) === next) queues.delete(channelId);
    });
    return next;
  }

  // Генерирует ответ модели по истории тикета и отправляет его в канал.
  // skippable: модель может промолчать через <SKIP> (для ответов игроку, не для приветствия)
  async function respond(channel, { extra = [], fallback = null, skippable = false } = {}) {
    const ticket = await db.findTicketByChannel(channel.id);
    if (!ticket || ticket.status === 'closed') return;

    let reply;
    try {
      const history = await db.recentMessages(ticket.id, contextMessages);
      reply = await ai.complete(buildMessages(ticket, [...history, ...extra]));
    } catch (error) {
      console.error(`Ошибка ИИ в канале ${channel.id}:`, error);
      if (!fallback) return;
      reply = fallback;
    }

    if (reply.includes(SKIP)) {
      if (skippable || !fallback) return;
      reply = fallback;
    }

    for (const chunk of splitMessage(reply)) {
      await channel.send({ content: chunk, allowedMentions: { parse: [] } });
    }
    await db.addMessage(ticket.id, { role: 'assistant', authorName: '2pzbot', content: reply });
  }

  function staffRow() {
    return new ActionRowBuilder().addComponents(
      STAFF_BUTTONS.map((button) =>
        new ButtonBuilder()
          .setCustomId(`${ACTION_PREFIX}${button.action}`)
          .setLabel(button.label)
          .setStyle(button.style),
      ),
    );
  }

  async function postApplication(channel, ticket) {
    const embed = new EmbedBuilder()
      .setTitle('Заявление')
      .setColor(0x5865f2)
      .addFields(
        ticket.answers.map((answer) => ({ name: answer.label, value: answer.value || '—', inline: false })),
      )
      .addFields(
        { name: 'Пользователь', value: `<@${ticket.user_id}>`, inline: true },
        { name: 'Username', value: ticket.username, inline: true },
        { name: 'ID', value: ticket.user_id, inline: true },
      )
      .setTimestamp(new Date(ticket.created_at));

    const message = await channel.send({
      content: `${staffRoleIds.map((id) => `<@&${id}>`).join(' ')} <@${ticket.user_id}>`,
      embeds: [embed],
      components: [staffRow()],
      allowedMentions: { roles: staffRoleIds, users: [ticket.user_id] },
    });
    await message.pin().catch((error) => console.warn('Не удалось закрепить заявку:', error.message));
  }

  function panelPayload() {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Подать заявку в 2pz')
      .setDescription(
        'Нажмите кнопку ниже и заполните анкету. Для заявки откроется приватный канал: там ответит ассистент, а модераторы напишут решение.\n\n' +
          '> Эта форма будет получена приложением 2pzbot. Не указывайте свои пароли и прочую конфиденциальную информацию.',
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PANEL_BUTTON_ID)
        .setLabel('Подать тикет')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [row] };
  }

  // Публикует панель и снимает старые панели бота, чтобы в канале была одна кнопка
  async function publishPanel(channel) {
    const pins = await channel.messages.fetchPins().catch(() => null);
    for (const { message } of pins?.items ?? []) {
      const isOldPanel =
        message.author.id === client.user.id &&
        message.components.some((row) => row.components.some((c) => c.customId === PANEL_BUTTON_ID));
      if (isOldPanel) await message.delete().catch(() => {});
    }

    const panel = await channel.send(panelPayload());
    await panel.pin();
  }

  async function panelCommand(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const channel = await client.channels.fetch(config.panelChannelId);
    await publishPanel(channel);
    return replyEphemeral(interaction, `Панель опубликована в <#${channel.id}>.`);
  }

  async function openFormModal(interaction) {
    const active = await db.findActiveTicketByUser(interaction.user.id);
    if (active) {
      return replyEphemeral(interaction, `У вас уже есть открытая заявка: <#${active.channel_id}>`);
    }
    return interaction.showModal(buildFormModal());
  }

  async function submitForm(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild, user } = interaction;
    const active = await db.findActiveTicketByUser(user.id);
    if (active) {
      return interaction.editReply(`У вас уже есть открытая заявка: <#${active.channel_id}>`);
    }

    const answers = readAnswers(interaction);
    const problems = validateAnswers(answers);
    if (problems.length > 0) {
      const lines = problems.map((p) => `• **${p.label}**: ${p.problem}`);
      return interaction.editReply(
        `Заявка не отправлена, анкета заполнена некорректно. Исправьте поля и подайте заново:\n${lines.join('\n')}`,
      );
    }

    const channel = await guild.channels.create({
      name: `заявление-${slugify(user.username, user.id)}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      topic: `Заявка ${user.id}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: ACTIVE_PERMS },
        ...staffRoleIds.map((id) => ({
          id,
          allow: [...ACTIVE_PERMS, PermissionFlagsBits.ManageMessages],
        })),
        {
          id: client.user.id,
          allow: [
            ...ACTIVE_PERMS,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });

    let ticket;
    try {
      ticket = await db.createTicket({
        guildId: guild.id,
        channelId: channel.id,
        userId: user.id,
        username: user.username,
        answers,
      });
    } catch (error) {
      // Например, гонка двух отправок: частичный индекс не даст создать вторую заявку
      await channel.delete('Заявка не сохранена').catch(() => {});
      throw error;
    }

    await postApplication(channel, ticket);
    await interaction.editReply(`Заявка создана: <#${channel.id}>`);

    enqueue(channel.id, () =>
      respond(channel, { extra: [{ role: 'system', content: GREETING_REQUEST }], fallback: GREETING_FALLBACK }),
    );
  }

  // Закрывает заявку (освобождает слот у игрока), показывает плашку и удаляет канал
  async function closeTicket(interaction, decidedBy, note) {
    await db.setStatus(interaction.channelId, 'closed', decidedBy);
    await interaction.reply({ embeds: [closedEmbed(note)] });
    setTimeout(() => {
      interaction.channel
        ?.delete('Тикет закрыт')
        .catch((error) => console.error('Не удалось удалить канал:', error));
    }, DELETE_DELAY_MS);
  }

  function actionText(action, ticket) {
    const voice = config.voiceChannelId ? `Подключайтесь в голосовой канал <#${config.voiceChannelId}>.` : '';
    const texts = {
      accept: `✅ <@${ticket.user_id}>, заявка **принята**. Поздравляем! Дальнейшие шаги будут в этом канале.`,
      review: '⏳ Заявка взята на **рассмотрение**. Ожидайте решения модераторов.',
      call: `📞 <@${ticket.user_id}>, вас вызвали на **обзвон**. ${voice || 'Ожидайте сообщения модератора в этом канале.'}`,
    };
    return texts[action];
  }

  async function staffAction(interaction, action) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');

    const ticket = await db.findTicketByChannel(interaction.channelId);
    const button = STAFF_BUTTONS.find((b) => b.action === action);
    if (!ticket || !button) return replyEphemeral(interaction, 'Заявка не найдена.');

    // Решения, после которых тикет закрывается: плашка и удаление канала
    const closing = CLOSING_DECISIONS[action];
    if (closing) {
      await db.addMessage(ticket.id, {
        role: 'system',
        content: `Заявка ${closing.verdict} (решение модератора ${interaction.user.username}), канал закрыт`,
      });
      return closeTicket(interaction, interaction.user.id, closing.note(ticket.user_id));
    }

    await db.setStatus(ticket.channel_id, button.status, interaction.user.id);
    await db.addMessage(ticket.id, {
      role: 'system',
      content: `Статус заявки: ${statusTitle(button.status)} (решение модератора ${interaction.user.username})`,
    });

    return interaction.reply({
      content: actionText(action, ticket),
      allowedMentions: { users: [ticket.user_id] },
    });
  }

  async function closeCommand(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const ticket = await db.findTicketByChannel(interaction.channelId);
    if (!ticket) return replyEphemeral(interaction, 'Это не канал заявки.');

    return closeTicket(interaction, interaction.user.id);
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') return panelCommand(interaction);
      if (interaction.commandName === 'close') return closeCommand(interaction);
      return null;
    }

    if (interaction.isButton()) {
      if (interaction.customId === PANEL_BUTTON_ID) return openFormModal(interaction);
      if (interaction.customId.startsWith(ACTION_PREFIX)) {
        return staffAction(interaction, interaction.customId.slice(ACTION_PREFIX.length));
      }
      return null;
    }

    if (interaction.isModalSubmit() && interaction.customId === FORM_MODAL_ID) {
      return submitForm(interaction);
    }
    return null;
  }

  // Сообщения в канале заявки: ответы ассистента на игрока, заметки модерации в память
  async function handleMessage(message) {
    if (!message.guild || message.guild.id !== config.guildId) return;
    if (message.author.bot) return;

    const ticket = await db.findTicketByChannel(message.channelId);
    if (!ticket || ticket.status === 'closed') return;

    const content = message.content.trim();
    if (!content) return;

    if (message.author.id !== ticket.user_id) {
      if (isStaff(message.member)) {
        await db.addMessage(ticket.id, {
          role: 'staff',
          authorId: message.author.id,
          authorName: message.member.displayName,
          content,
        });
      }
      return;
    }

    await db.addMessage(ticket.id, {
      role: 'user',
      authorId: message.author.id,
      authorName: message.author.username,
      content,
    });

    // Модераторы сами общаются с игроком: ассистент не вмешивается.
    // Сообщения, которые обращаются к боту, на тишину не влияют.
    const staffTalk = await db.recentStaffMessages(ticket.id, STAFF_SILENCE_MINUTES);
    if (staffTalk.some((text) => !addressesBot(text, client.user.id))) return;

    enqueue(message.channelId, () => respond(message.channel, { fallback: REPLY_FALLBACK, skippable: true }));
  }

  return { publishPanel, handleInteraction, handleMessage };
}
