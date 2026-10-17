import { loadServers } from './servers.js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
};

const positiveNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Серверы Discord (ID, панели, роли) — в config/servers.json. Здесь только секреты и настройки ИИ.
export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    servers: loadServers(new URL('../config/servers.json', import.meta.url)),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  ai: {
    baseUrl: (process.env.RIVER_BASE_URL?.trim() || 'https://api.river.ai/v1').replace(/\/$/, ''),
    apiKey: required('RIVER_API_KEY'),
    model: process.env.AI_MODEL?.trim() || 'zai-org/GLM-5.3-Flash',
    maxTokens: positiveNumber('AI_MAX_TOKENS', 700),
    contextMessages: positiveNumber('AI_CONTEXT_MESSAGES', 30),
  },
};
