import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { createDb } from './db.js';
import { createAiClient } from './ai.js';
import { createTicketBot } from './tickets.js';

const COMMANDS = [
  { name: 'panel', description: 'Опубликовать и закрепить кнопку подачи заявки' },
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
  config: config.discord,
  contextMessages: config.ai.contextMessages,
});

client.once(Events.ClientReady, async (readyClient) => {
  await db.init();

  const guild = await readyClient.guilds.fetch(config.discord.guildId);
  await guild.commands.set(COMMANDS);

  console.log(`Бот ${readyClient.user.tag} запущен, команды зарегистрированы на сервере ${guild.name}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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
