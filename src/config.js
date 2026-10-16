const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
};

const optional = (name) => process.env[name]?.trim() || null;

const positiveNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const staffRoleIds = (process.env.STAFF_ROLE_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (staffRoleIds.length === 0) {
  throw new Error('Не задан STAFF_ROLE_IDS: укажите ID ролей модерации через запятую');
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    guildId: required('GUILD_ID'),
    panelChannelId: required('PANEL_CHANNEL_ID'),
    ticketCategoryId: required('TICKET_CATEGORY_ID'),
    staffRoleIds,
    voiceChannelId: optional('VOICE_CHANNEL_ID'),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  ai: {
    baseUrl: (optional('RIVER_BASE_URL') ?? 'https://api.river.ai/v1').replace(/\/$/, ''),
    apiKey: required('RIVER_API_KEY'),
    model: optional('AI_MODEL') ?? 'zai-org/GLM-5.3-Flash',
    maxTokens: positiveNumber('AI_MAX_TOKENS', 700),
    contextMessages: positiveNumber('AI_CONTEXT_MESSAGES', 30),
  },
};
