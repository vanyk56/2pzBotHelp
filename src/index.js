import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { createDb } from './db.js';
import { createAiClient } from './ai.js';
import { createTicketBot } from './tickets.js';
import { createEventBot, ensureEventEmojis, EVENT_COMMAND } from './events.js';
import { RULES_COMMAND } from './rules-card.js';
import { PROFILES_COMMAND } from './profiles.js';
import { createStreamAlerts, STREAM_COMMANDS } from './streams.js';
import { createServerStats, STATS_COMMANDS } from './server-stats.js';

const COMMANDS = [
  { name: 'panel', description: 'Опубликовать и закрепить кнопки подачи заявок в этом канале' },
  { name: 'close', description: 'Закрыть тикет и удалить его канал' },
  PROFILES_COMMAND,
  RULES_COMMAND,
  ...STREAM_COMMANDS,
  ...STATS_COMMANDS,
];

const db = createDb(config.database.url);
const ai = createAiClient({ ...config.ai });
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const bot = createTicketBot({
  client,
  db,
  ai,
  servers: config.discord.servers,
  contextMessages: config.ai.contextMessages,
});
const events = createEventBot({ db, servers: config.discord.servers, client });
const streams = createStreamAlerts({ client, db, servers: config.discord.servers });
const serverStats = createServerStats({ client, db, servers: config.discord.servers });
const HOUR_MS = 60 * 60 * 1000;
let refreshTimer = null;

client.once(Events.ClientReady, async (readyClient) => {
  await db.init();

  // Команды регистрируем на каждом сервере из servers.json
  for (const server of config.discord.servers) {
    try {
      const guild = await readyClient.guilds.fetch(server.guildId);
      await guild.commands.set(server.events ? [...COMMANDS, EVENT_COMMAND] : COMMANDS);
      if (server.events) {
        await ensureEventEmojis(guild).catch((error) => console.error('Не удалось загрузить эмодзи сбора:', error.message));
      }
      console.log(`Команды зарегистрированы на сервере «${server.name}» (${guild.name})`);
    } catch (error) {
      console.error(`Не удалось зарегистрировать команды на сервере «${server.name}»:`, error.message);
    }
  }

  // Строка «через N часов» в сборах обновляется раз в час
  const refresh = () => events.refreshActive().catch((error) => console.error('Ошибка обновления сборов:', error));
  refresh();
  refreshTimer = setInterval(refresh, HOUR_MS);

  // Запуск мониторинга стримов Twitch
  streams.start();

  // Запуск счётчиков статистики сервера
  serverStats.start();

  console.log(`Бот ${readyClient.user.tag} запущен`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await serverStats.handleInteraction(interaction)) return;
    if (await streams.handleInteraction(interaction)) return;
    if (await events.handleInteraction(interaction)) return;
    await bot.handleInteraction(interaction);
  } catch (error) {
    console.error('Ошибка взаимодействия:', error);
    const payload = { content: 'Что-то пошло не так. Попробуйте ещё раз.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
    else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
  }
});

client.on(Events.MessageCreate, (message) => {
  bot.handleMessage(message).catch((error) => console.error('Ошибка сообщения:', error));
});

async function shutdown() {
  clearInterval(refreshTimer);
  streams.stop();
  serverStats.stop();
  await client.destroy();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
