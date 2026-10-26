import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import {
  buildFormModal,
  findType,
  FORM_MODAL_PREFIX,
  formStepCount,
  formStepFields,
  parseFormId,
  readAnswers,
  ticketConfig,
  validateAnswers,
} from './form.js';
import { buildMessages, greetingRequest, statusTitle } from './assistant.js';
import { renderRulesSet, rulesConfig } from './rules-card.js';
import { slugify, splitMessage } from './utils.js';
import {
  extractProfileAnswers,
  parseProfilesPageId,
  PROFILES_DELETE_PROMPT,
  PROFILES_DO_DELETE,
  PROFILES_PAGE_PREFIX,
  renderDeleteSelectMessage,
  renderProfilesMessage,
} from './profiles.js';
import { sendTicketLog } from './ticket-logs.js';

// Кнопка открытия формы: ticket:open:<id типа>. Старый ticket:open означает клан (панели, опубликованные до перехода)
const OPEN_PREFIX = 'ticket:open:';
const LEGACY_OPEN_ID = 'ticket:open';
const ACTION_PREFIX = 'ticket:act:';
const NEXT_PREFIX = 'ticket:next:';
const GREETING_FALLBACK = 'Спасибо за заявку! Модераторы скоро её рассмотрят, ответ появится в этом канале.';
const REPLY_FALLBACK = 'Сейчас не могу ответить на ваше сообщение. Модераторы увидят его в этом канале.';
// Модель пишет это слово, когда отвечать не нужно (small talk, не по теме)
const SKIP = '<SKIP>';
// Если модератор писал в тикет за это время, ассистент молчит и не встревает в разговор
const STAFF_SILENCE_MINUTES = 15;
const DELETE_DELAY_MS = 10_000;
// Сколько минут ждём второе окно анкеты, пока игрок его не открыл
const FORM_TTL_MS = 15 * 60 * 1000;
// Отметка, по которой находим старые сообщения с правилами, чтобы заменить их новыми
const RULES_MARK = { public: '📜 Правила сервера', private: '📜 Правила клана' };
// Лимит Discord: до 10 embed (и 10 файлов) в одном сообщении
const RULES_PER_MESSAGE = 10;
// Цвет полосы embed под фон Discord, чтобы карточки выглядели одним столбиком
const RULES_COLOR = 0x2b2d31;

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
};

const ACTIVE_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

// Ответы первого окна, пока игрок не открыл следующее: ключ «пользователь:тип»
const pendingForms = new Map();
const pendingKey = (userId, typeId) => `${userId}:${typeId}`;

// Модалка причины отказа: модератор пишет её, бот отправляет игроку в ЛС
export const REASON_MODAL_ID = 'ticket:reason';

export function buildReasonModal() {
  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Причина отказа')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(1000)
    .setPlaceholder('Коротко, что не подошло. Игрок увидит это в ЛС');

  return new ModalBuilder()
    .setCustomId(REASON_MODAL_ID)
    .setTitle('Отклонить заявку')
    .addComponents(new ActionRowBuilder().addComponents(reason));
}

// Обращается ли сообщение к боту: упоминание или слово «бот» / «2pzbot» отдельно
export function addressesBot(text, botId) {
  return text.includes(`<@${botId}>`) || /(^|[^\p{L}])(бот|2pzbot)([^\p{L}]|$)/iu.test(text);
}

// Плашка при закрытии тикета; note — необязательная первая строка (например, решение модератора)
function closedEmbed(note, isThread = false) {
  const lines = [
    note,
    isThread
      ? 'Ветка тикета будет заблокирована и сохранена в архиве через 10 секунд.'
      : 'Канал и история сообщений будут удалены через 10 секунд.',
    'Спасибо за обращение! Если вопрос возникнет снова, создайте новый тикет.',
  ];
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🔒 Тикет закрыт')
    .setDescription(lines.filter(Boolean).join('\n\n'));
}

// Текст об ошибках анкеты
function problemsText(problems) {
  const lines = problems.map((p) => `• **${p.label}**: ${p.problem}`);
  return `Заявка не отправлена, анкета заполнена некорректно. Исправьте поля и подайте заново:\n${lines.join('\n')}`;
}

export function createTicketBot({ client, db, ai, servers, contextMessages }) {
  // Бот работает на нескольких серверах: настройки берём по ID сервера, с которого пришло событие
  const serverByGuild = new Map(servers.map((server) => [server.guildId, server]));
  // Ответы модели идут по одному на канал, чтобы не перемешивались
  const queues = new Map();

  const isStaff = (member, server) => {
    const roles = Array.isArray(member?.roles) ? member.roles : [...(member?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => server.staffRoleIds.includes(id));
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

  async function postApplication(channel, ticket, type, server) {
    const embed = new EmbedBuilder()
      .setTitle('Заявление')
      .setColor(0x5865f2)
      .addFields(
        ticket.answers.map((answer) => ({ name: answer.label, value: answer.value || '—', inline: false })),
      )
      .addFields(
        { name: 'Тип заявки', value: type.name, inline: true },
        { name: 'Пользователь', value: `<@${ticket.user_id}>`, inline: true },
        { name: 'Username', value: ticket.username, inline: true },
        { name: 'ID', value: ticket.user_id, inline: true },
      )
      .setTimestamp(new Date(ticket.created_at));

    const message = await channel.send({
      content: `${server.staffRoleIds.map((id) => `<@&${id}>`).join(' ')} <@${ticket.user_id}>`,
      embeds: [embed],
      components: [staffRow()],
      allowedMentions: { roles: server.staffRoleIds, users: [ticket.user_id] },
    });
    await message.pin().catch((error) => console.warn('Не удалось закрепить заявку:', error.message));
  }

  // Панель сервера: текст из tickets.json и кнопка на каждый тип, включённый на этом сервере
  function panelPayload(server) {
    const panel = ticketConfig.panels[server.panelKey];
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(panel.title).setDescription(panel.description);

    const buttons = server.types.map((typeId) => {
      const type = findType(typeId);
      const button = new ButtonBuilder()
        .setCustomId(`${OPEN_PREFIX}${type.id}`)
        .setLabel(type.button)
        .setStyle(ButtonStyle.Primary);
      if (type.emoji) button.setEmoji(type.emoji);
      return button;
    });

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
  }

  // Публикует панель сервера и снимает старые панели бота, чтобы в канале оставалась одна актуальная
  async function publishPanel(server) {
    const channel = await client.channels.fetch(server.panelChannelId);
    const pins = await channel.messages.fetchPins().catch(() => null);
    for (const { message } of pins?.items ?? []) {
      const isOldPanel =
        message.author.id === client.user.id &&
        message.components.some((row) =>
          row.components.some((c) => c.customId?.startsWith(OPEN_PREFIX) || c.customId === LEGACY_OPEN_ID),
        );
      if (isOldPanel) await message.delete().catch(() => {});
    }

    const panel = await channel.send(panelPayload(server));
    await panel.pin();
    return channel;
  }

  async function panelCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const channel = await publishPanel(server);
    return replyEphemeral(interaction, `Панель опубликована в <#${channel.id}>.`);
  }

  // Правила картинками: публичные и клановые, в выбранном канале, закрепляются. Старые правила заменяются
  async function rulesCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    const pins = await channel.messages.fetchPins().catch(() => null);
    const marks = Object.values(RULES_MARK);
    for (const { message } of pins?.items ?? []) {
      if (message.author.id === client.user.id && marks.includes(message.content)) {
        await message.unpin().catch(() => {});
        await message.delete().catch(() => {});
      }
    }

    for (const key of ['public', 'private']) {
      const images = await renderRulesSet(key, rulesConfig[key]);
      for (let i = 0; i < images.length; i += RULES_PER_MESSAGE) {
        const group = images.slice(i, i + RULES_PER_MESSAGE);
        const message = await channel.send({
          content: RULES_MARK[key],
          files: group.map(({ name, png }) => new AttachmentBuilder(png, { name })),
          embeds: group.map(({ name }) => new EmbedBuilder().setColor(RULES_COLOR).setImage(`attachment://${name}`)),
        });
        await message.pin().catch((error) => console.warn('Не удалось закрепить правила:', error.message));
      }
    }

    return interaction.editReply(`Правила опубликованы и закреплены в <#${channel.id}>.`);
  }

  // Проверяет наличие открытой заявки, проверяя её существование в Discord.
  // Если канал был удален вручную в Discord (#неизвестно), бот сам закрывает старый тикет в БД.
  async function getValidActiveTicket(userId) {
    const active = await db.findActiveTicketByUser(userId);
    if (!active) return null;

    try {
      const channel = await client.channels.fetch(active.channel_id).catch(() => null);
      if (!channel || channel.deleted) {
        await db.setStatus(active.channel_id, 'closed', 'channel_deleted');
        return null;
      }
    } catch {
      await db.setStatus(active.channel_id, 'closed', 'channel_deleted');
      return null;
    }

    return active;
  }

  async function cleanupOrphanTickets() {
    try {
      const openTickets = await db.findOpenTickets();
      for (const t of openTickets) {
        const channel = await client.channels.fetch(t.channel_id).catch(() => null);
        if (!channel || channel.deleted) {
          await db.setStatus(t.channel_id, 'closed', 'orphan_cleanup');
        }
      }
    } catch (err) {
      console.warn('Ошибка очистки зависших тикетов:', err.message);
    }
  }

  async function openFormModal(interaction, type, server) {
    if (!type || !server.types.includes(type.id)) {
      return replyEphemeral(interaction, 'Этот тип тикета недоступен на этом сервере.');
    }
    const active = await getValidActiveTicket(interaction.user.id);
    if (active) {
      return replyEphemeral(interaction, `У вас уже есть открытая заявка: <#${active.channel_id}>`);
    }
    return interaction.showModal(buildFormModal(type, 0));
  }

  // Кнопка «Далее» после первого окна: открывает следующее окно анкеты (или то же окно, если в нём была ошибка)
  async function openNextStep(interaction, type, step) {
    const pending = pendingForms.get(pendingKey(interaction.user.id, type.id));
    const ready = step === 0 || (pending && pending.step === step - 1 && pending.expires > Date.now());
    if (!ready) return replyEphemeral(interaction, 'Анкета устарела, подайте заявку заново.');
    return interaction.showModal(buildFormModal(type, step));
  }

  // Ответ после окна анкеты: следующий шаг или сообщение об ошибке с кнопкой повтора
  function stepReply(interaction, type, step, content) {
    const count = formStepCount(type);
    const nextStep = step + 1 < count ? step + 1 : step;
    const label = step + 1 < count ? 'Далее' : 'Заполнить заново';
    const button = new ButtonBuilder()
      .setCustomId(`${NEXT_PREFIX}${type.id}:${nextStep}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
    return interaction.reply({
      content,
      components: [new ActionRowBuilder().addComponents(button)],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function submitForm(interaction, type, server, step) {
    const stepType = { ...type, fields: formStepFields(type, step) };
    const answers = readAnswers(interaction, stepType);
    const problems = validateAnswers(answers, stepType);
    const key = pendingKey(interaction.user.id, type.id);

    if (problems.length > 0) {
      if (step === 0) return replyEphemeral(interaction, problemsText(problems));
      return stepReply(interaction, type, step, problemsText(problems));
    }

    let previous = [];
    if (step > 0) {
      const pending = pendingForms.get(key);
      if (!pending || pending.step !== step - 1 || pending.expires < Date.now()) {
        return replyEphemeral(interaction, 'Анкета устарела, подайте заявку заново.');
      }
      previous = pending.answers;
    }

    const all = [...previous, ...answers];
    const count = formStepCount(type);
    if (step < count - 1) {
      pendingForms.set(key, { answers: all, step, expires: Date.now() + FORM_TTL_MS });
      return stepReply(interaction, type, step, `Шаг ${step + 1} из ${count} сохранён. Нажмите «Далее», чтобы продолжить.`);
    }

    pendingForms.delete(key);
    return createTicket(interaction, type, server, all);
  }

  async function createTicket(interaction, type, server, answers) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild, user } = interaction;
    const active = await getValidActiveTicket(user.id);
    if (active) {
      return interaction.editReply(`У вас уже есть открытая заявка: <#${active.channel_id}>`);
    }

    let channel = null;
    const threadName = `${type.channelPrefix || 'тикет'}-${slugify(user.username, user.id)}`;

    // 1. Создаём приватную ветку в канале панели заявок (как на скриншоте)
    try {
      const panelChannel =
        interaction.channel ??
        (server.panelChannelId ? await guild.channels.fetch(server.panelChannelId).catch(() => null) : null);

      if (panelChannel && typeof panelChannel.threads?.create === 'function') {
        channel = await panelChannel.threads.create({
          name: threadName,
          type: ChannelType.PrivateThread,
          autoArchiveDuration: 10080,
          invitable: false,
          reason: `Тикет ${type.name} для ${user.username}`,
        });
        await channel.members.add(user.id).catch((err) =>
          console.warn('Не удалось добавить игрока в ветку:', err.message),
        );
      }
    } catch (threadError) {
      console.warn('Не удалось создать приватную ветку тикета, пробуем создать канал:', threadError.message);
    }

    // 2. Фоллбэк: если создать ветку не удалось, создаём текстовый канал в категории
    if (!channel) {
      channel = await guild.channels.create({
        name: threadName,
        type: ChannelType.GuildText,
        parent: server.ticketCategoryId,
        topic: `${type.name} · ${user.id}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: ACTIVE_PERMS },
          ...server.staffRoleIds.map((id) => ({
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
    }

    let ticket;
    try {
      ticket = await db.createTicket({
        guildId: guild.id,
        channelId: channel.id,
        userId: user.id,
        username: user.username,
        type: type.id,
        answers,
      });
    } catch (error) {
      await channel.delete('Заявка не сохранена').catch(() => {});
      throw error;
    }

    await postApplication(channel, ticket, type, server);
    await interaction.editReply(`Заявка создана: <#${channel.id}>`);

    // Отправляем лог в канал тикет-логов
    await sendTicketLog({
      guild,
      server,
      client,
      action: 'created',
      ticket,
      type,
      answers,
      channel,
    }).catch((err) => console.warn('Не удалось отправить лог создания тикета:', err.message));

    enqueue(channel.id, () =>
      respond(channel, { extra: [{ role: 'system', content: greetingRequest(type) }], fallback: GREETING_FALLBACK }),
    );
  }

  // Закрывает заявку (освобождает слот у игрока), показывает плашку и блокирует/архивирует ветку или удаляет канал
  async function closeTicket(interaction, decidedBy, note) {
    await db.setStatus(interaction.channelId, 'closed', decidedBy);
    const isThread = Boolean(interaction.channel?.isThread?.());
    const payload = { embeds: [closedEmbed(note, isThread)] };
    if (interaction.deferred) await interaction.editReply(payload);
    else await interaction.reply(payload);

    setTimeout(async () => {
      try {
        if (interaction.channel?.isThread?.()) {
          await interaction.channel.setLocked(true, 'Тикет закрыт').catch(() => {});
          await interaction.channel.setArchived(true, 'Тикет закрыт').catch(() => {});
        } else {
          await interaction.channel
            ?.delete('Тикет закрыт')
            .catch((error) => console.error('Не удалось удалить канал:', error));
        }
      } catch (error) {
        console.error('Ошибка при архивации/удалении канала тикета:', error);
      }
    }, DELETE_DELAY_MS);
  }

  function actionText(action, ticket, server) {
    const voice = server.voiceChannelId ? `Подключайтесь в голосовой канал <#${server.voiceChannelId}>.` : '';
    const texts = {
      accept: `✅ <@${ticket.user_id}>, заявка **принята**. Поздравляем! Дальнейшие шаги будут в этом канале.`,
      review: '⏳ Заявка взята на **рассмотрение**. Ожидайте решения модераторов.',
      call: `📞 <@${ticket.user_id}>, вас вызвали на **обзвон**. ${voice || 'Ожидайте сообщения модератора в этом канале.'}`,
    };
    return texts[action];
  }

  // Личное сообщение игроку с причиной отказа. Возвращает false, если ЛС закрыты
  async function sendRejectionDm(userId, reason, guildName) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle(`Заявка отклонена · ${guildName}`)
            .setDescription(`**Причина:** ${reason}\n\nСпасибо за интерес! Если появятся вопросы, создайте новый тикет.`),
        ],
      });
      return true;
    } catch (error) {
      console.warn('Не удалось отправить причину отказа в ЛС:', error.message);
      return false;
    }
  }

  // Отказ с причиной из модалки: ЛС игроку, плашка в канале, закрытие тикета
  async function rejectWithReason(interaction, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');
    }
    await interaction.deferReply();

    const ticket = await db.findTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status === 'closed') {
      return interaction.editReply('Заявка не найдена или уже закрыта.');
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const delivered = await sendRejectionDm(ticket.user_id, reason, interaction.guild.name);
    await db.addMessage(ticket.id, {
      role: 'system',
      content: `Заявка отклонена (решение модератора ${interaction.user.username}). Причина: ${reason}`,
    });

    // Отправляем лог отклонения в канал логов
    await sendTicketLog({
      guild: interaction.guild,
      server,
      client,
      action: 'rejected',
      ticket,
      type: findType(ticket.ticket_type),
      answers: ticket.answers,
      decidedBy: interaction.user.id,
      reason,
      channel: interaction.channel,
    }).catch((err) => console.warn('Не удалось отправить лог отклонения тикета:', err.message));

    const note = [
      `❌ Заявка **отклонена**.`,
      `**Причина:** ${reason}`,
      delivered ? '' : '⚠️ Причину не удалось отправить в ЛС: у игрока закрыты личные сообщения.',
    ]
      .filter(Boolean)
      .join('\n\n');
    return closeTicket(interaction, interaction.user.id, note);
  }

  async function staffAction(interaction, action, server) {
    if (!isStaff(interaction.member, server)) {
      return replyEphemeral(interaction, 'Эта кнопка доступна только модерации.');
    }

    const ticket = await db.findTicketByChannel(interaction.channelId);
    const button = STAFF_BUTTONS.find((b) => b.action === action);
    if (!ticket || !button) return replyEphemeral(interaction, 'Заявка не найдена.');

    // Отказ требует причину: сначала модалка, закрытие в rejectWithReason
    if (action === 'reject') return interaction.showModal(buildReasonModal());

    let roleNote = '';

    // Если заявка принята — сохраняем профиль игрока в базу данных (Steam, Telegram, Имя, Часы)
    if (action === 'accept') {
      const answers = Array.isArray(ticket.answers)
        ? ticket.answers
        : typeof ticket.answers === 'string'
          ? JSON.parse(ticket.answers)
          : [];
      const { steam, telegram, realName, hours } = extractProfileAnswers(answers);
      if (steam || telegram || realName) {
        try {
          await db.saveProfile({
            guildId: ticket.guild_id || interaction.guildId,
            userId: ticket.user_id,
            username: ticket.username,
            steam,
            telegram,
            realName,
            hours,
            ticketId: ticket.id,
            acceptedBy: interaction.user.id,
          });
        } catch (error) {
          console.error('Ошибка сохранения профиля игрока:', error);
        }
      }

      // Выдаём роль принятого игрока, если она настроена для сервера
      if (server.acceptedRoleId) {
        try {
          const targetGuild =
            interaction.guild?.id === server.guildId
              ? interaction.guild
              : await client.guilds.fetch(server.guildId).catch(() => null);

          if (!targetGuild) {
            roleNote = `⚠️ Не удалось найти сервер (ID ${server.guildId}) для выдачи роли.`;
          } else {
            const member = await targetGuild.members.fetch(ticket.user_id).catch(() => null);
            if (!member) {
              roleNote = `⚠️ Игрок <@${ticket.user_id}> не найден на сервере ${targetGuild.name}.`;
            } else {
              await member.roles.add(server.acceptedRoleId);
              roleNote = `🎉 Роль <@&${server.acceptedRoleId}> успешно выдана!`;
            }
          }
        } catch (error) {
          console.error(`Ошибка при выдаче роли ${server.acceptedRoleId}:`, error);
          if (error.code === 50013) {
            roleNote = `⚠️ Не удалось выдать роль <@&${server.acceptedRoleId}>: у бота нет права «Управление ролями» (Manage Roles) или роль бота в настройках сервера стоит ниже роли <@&${server.acceptedRoleId}> в списке ролей сервера.`;
          } else {
            roleNote = `⚠️ Ошибка выдачи роли <@&${server.acceptedRoleId}>: ${error.message}`;
          }
        }
      }

      // Отправляем лог принятия заявки
      await sendTicketLog({
        guild: interaction.guild,
        server,
        client,
        action: 'accepted',
        ticket,
        type: findType(ticket.ticket_type),
        answers,
        decidedBy: interaction.user.id,
        roleNote,
        channel: interaction.channel,
      }).catch((err) => console.warn('Не удалось отправить лог принятия тикета:', err.message));
    }

    // Решения, после которых тикет закрывается: плашка и закрытие ветки/канала
    const closing = CLOSING_DECISIONS[action];
    if (closing) {
      const finalNote = [closing.note(ticket.user_id), roleNote].filter(Boolean).join('\n\n');
      await db.addMessage(ticket.id, {
        role: 'system',
        content: `Заявка ${closing.verdict} (решение модератора ${interaction.user.username}), канал закрыт. ${roleNote}`,
      });
      return closeTicket(interaction, interaction.user.id, finalNote);
    }

    await db.setStatus(ticket.channel_id, button.status, interaction.user.id);
    await db.addMessage(ticket.id, {
      role: 'system',
      content: `Статус заявки: ${statusTitle(button.status)} (решение модератора ${interaction.user.username})`,
    });

    // Отправляем лог изменения статуса (на рассмотрении, вызов на обзвон)
    await sendTicketLog({
      guild: interaction.guild,
      server,
      client,
      action,
      ticket,
      type: findType(ticket.ticket_type),
      answers: ticket.answers,
      decidedBy: interaction.user.id,
      channel: interaction.channel,
    }).catch((err) => console.warn('Не удалось отправить лог статуса тикета:', err.message));

    return interaction.reply({
      content: actionText(action, ticket, server),
      allowedMentions: { users: [ticket.user_id] },
    });
  }

  async function closeCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const ticket = await db.findTicketByChannel(interaction.channelId);
    if (!ticket) return replyEphemeral(interaction, 'Это не канал заявки.');

    await sendTicketLog({
      guild: interaction.guild,
      server,
      client,
      action: 'closed',
      ticket,
      type: findType(ticket.ticket_type),
      answers: ticket.answers,
      decidedBy: interaction.user.id,
      channel: interaction.channel,
    }).catch((err) => console.warn('Не удалось отправить лог закрытия тикета:', err.message));

    return closeTicket(interaction, interaction.user.id);
  }

  async function profilesCommand(interaction, server) {
    if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');

    const deleteUser = interaction.options.getUser('delete_user');
    if (deleteUser) {
      await db.deleteProfile(interaction.guildId, deleteUser.id);
      return interaction.reply({
        content: `🗑️ Профиль игрока <@${deleteUser.id}> (${deleteUser.username}) успешно удалён из базы данных.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const profiles = await db.listProfiles(interaction.guildId);
    const payload = renderProfilesMessage(profiles, 0, interaction.guild?.name);
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }

  async function handleInteraction(interaction) {
    const server = serverByGuild.get(interaction.guildId);
    if (!server) return null;

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'panel') return panelCommand(interaction, server);
      if (interaction.commandName === 'close') return closeCommand(interaction, server);
      if (interaction.commandName === 'rules') return rulesCommand(interaction, server);
      if (interaction.commandName === 'profiles') return profilesCommand(interaction, server);
      return null;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === LEGACY_OPEN_ID) return openFormModal(interaction, findType('clan'), server);
      if (id.startsWith(OPEN_PREFIX)) {
        return openFormModal(interaction, findType(id.slice(OPEN_PREFIX.length)), server);
      }
      if (id.startsWith(NEXT_PREFIX)) {
        const [typeId, step] = id.slice(NEXT_PREFIX.length).split(':');
        const type = findType(typeId);
        if (!type || !server.types.includes(type.id)) return null;
        return openNextStep(interaction, type, Number(step));
      }
      if (id.startsWith(ACTION_PREFIX)) {
        return staffAction(interaction, id.slice(ACTION_PREFIX.length), server);
      }
      if (id.startsWith(PROFILES_PAGE_PREFIX)) {
        if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');
        const page = parseProfilesPageId(id);
        const profiles = await db.listProfiles(interaction.guildId);
        const payload = renderProfilesMessage(profiles, page, interaction.guild?.name);
        return interaction.update({ content: null, ...payload });
      }
      if (id === PROFILES_DELETE_PROMPT) {
        if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');
        const profiles = await db.listProfiles(interaction.guildId);
        const payload = renderDeleteSelectMessage(profiles, interaction.guild?.name);
        return interaction.update({ content: null, ...payload });
      }
      return null;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === PROFILES_DO_DELETE) {
      if (!isStaff(interaction.member, server)) return replyEphemeral(interaction, 'Команда только для модерации.');
      const userId = interaction.values[0];
      await db.deleteProfile(interaction.guildId, userId);
      const profiles = await db.listProfiles(interaction.guildId);
      const payload = renderProfilesMessage(profiles, 0, interaction.guild?.name);
      return interaction.update({
        content: `✅ Профиль игрока <@${userId}> успешно удалён!`,
        ...payload,
      });
    }

    if (interaction.isModalSubmit() && interaction.customId === REASON_MODAL_ID) {
      return rejectWithReason(interaction, server);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith(FORM_MODAL_PREFIX)) {
      const { typeId, step } = parseFormId(interaction.customId);
      const type = findType(typeId);
      if (!type || !server.types.includes(type.id)) return null;
      return submitForm(interaction, type, server, step);
    }
    return null;
  }

  // Сообщения в канале заявки: ответы ассистента на игрока, заметки модерации в память
  async function handleMessage(message) {
    const server = serverByGuild.get(message.guild?.id);
    if (!server) return;
    if (message.author.bot) return;

    const ticket = await db.findTicketByChannel(message.channelId);
    if (!ticket || ticket.status === 'closed') return;

    const content = message.content.trim();
    if (!content) return;

    if (message.author.id !== ticket.user_id) {
      if (isStaff(message.member, server)) {
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

    const staffTalk = await db.recentStaffMessages(ticket.id, STAFF_SILENCE_MINUTES);
    if (staffTalk.some((text) => !addressesBot(text, client.user.id))) return;

    enqueue(message.channelId, () => respond(message.channel, { fallback: REPLY_FALLBACK, skippable: true }));
  }

  return { handleInteraction, handleMessage, cleanupOrphanTickets };
}
