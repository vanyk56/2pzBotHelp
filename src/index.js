import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { createDb } from './db.js';
import { createAiClient } from './ai.js';
import { createTicketBot } from './tickets.js';
import { createEventBot, EVENT_COMMAND } from './events.js';

const COMMANDS = [
  { name: 'panel', description: 'Опубликовать и закрепить кнопки подачи заявок в этом канале' },
  { name: 'close', description: 'Закрыть тикет и удалить его канал' },
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
const events = createEventBot({ db, servers: config.discord.servers });

client.once(Events.ClientReady, async (readyClient) => {
  await db.init();

  // Команды регистрируем на каждом сервере из servers.json
  for (const server of config.discord.servers) {
    try {
      const guild = await readyClient.guilds.fetch(server.guildId);
      await guild.commands.set(server.events ? [...COMMANDS, EVENT_COMMAND] : COMMANDS);
      console.log(`Команды зарегистрированы на сервере «${server.name}» (${guild.name})`);
    } catch (error) {
      console.error(`Не удалось зарегистрировать команды на сервере «${server.name}»:`, error.message);
    }
  }

  console.log(`Бот ${readyClient.user.tag} запущен`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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
  await client.destroy();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discord.token);
