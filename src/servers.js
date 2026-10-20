import { readFileSync } from 'node:fs';
import { findType, ticketConfig } from './form.js';

const SNOWFLAKE = /^\d{17,20}$/;

// Читает config/servers.json: какие серверы обслуживает бот, где его панель, какие типы тикетов и кто модерирует.
// Проверяет ID, чтобы бот не стартовал с незаполненными значениями.
export function loadServers(url) {
  const { servers } = JSON.parse(readFileSync(url, 'utf8'));
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('servers.json: добавьте хотя бы один сервер');
  }

  const guildIds = new Set();
  return servers.map((server) => {
    const label = server.name ?? server.guildId;
    const snowflake = (value, field) => {
      if (!SNOWFLAKE.test(String(value ?? ''))) {
        throw new Error(`servers.json, «${label}»: укажите ID в поле ${field} (сейчас: ${value ?? 'пусто'})`);
      }
      return String(value);
    };

    const guildId = snowflake(server.guildId, 'guildId');
    if (guildIds.has(guildId)) throw new Error(`servers.json: сервер ${guildId} указан дважды`);
    guildIds.add(guildId);

    if (!ticketConfig.panels[server.panelKey]) {
      throw new Error(`servers.json, «${label}»: нет панели «${server.panelKey}» в tickets.json`);
    }

    const types = (server.types ?? []).map((id) => {
      if (!findType(id)) throw new Error(`servers.json, «${label}»: нет типа тикета «${id}» в tickets.json`);
      return id;
    });
    if (types.length === 0) throw new Error(`servers.json, «${label}»: укажите хотя бы один тип тикета`);

    const staffRoleIds = (server.staffRoleIds ?? []).map((id) => snowflake(id, 'staffRoleIds'));
    if (staffRoleIds.length === 0) throw new Error(`servers.json, «${label}»: укажите роли модерации`);

    return {
      name: label,
      guildId,
      panelChannelId: snowflake(server.panelChannelId, 'panelChannelId'),
      panelKey: server.panelKey,
      types,
      ticketCategoryId: snowflake(server.ticketCategoryId, 'ticketCategoryId'),
      staffRoleIds,
      voiceChannelId: server.voiceChannelId ? snowflake(server.voiceChannelId, 'voiceChannelId') : null,
      // Роль, которая выдаётся игроку при принятии тикета («Принять»)
      acceptedRoleId: server.acceptedRoleId ? snowflake(server.acceptedRoleId, 'acceptedRoleId') : null,
      // Команда /event со сборами на вайп (только там, где включено)
      events: server.events === true,
      // Канал, куда ведут игроков, которые опаздывают или не будут (необязательно)
      rsvpChannelId: server.rsvpChannelId ? snowflake(server.rsvpChannelId, 'rsvpChannelId') : null,
      // Оповещения о стримах Twitch (канал # стримы)
      streamChannelId: server.streamChannelId ? snowflake(server.streamChannelId, 'streamChannelId') : null,
      streamers: Array.isArray(server.streamers)
        ? server.streamers.map((s) => String(s).toLowerCase().trim())
        : ['chotki_mops'],
      streamRolePing: server.streamRolePing ? String(server.streamRolePing) : null,
    };
  });
}
