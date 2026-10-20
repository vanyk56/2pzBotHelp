import pg from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id          BIGSERIAL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  channel_id  TEXT        NOT NULL UNIQUE,
  user_id     TEXT        NOT NULL,
  username    TEXT        NOT NULL,
  answers     JSONB       NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  decided_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Тип тикета (клан, коллер, медиа, модератор); старые заявки получают 'clan'
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'clan';

-- Одна незакрытая заявка на игрока
CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_user
  ON tickets (user_id) WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   BIGINT      NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  role        TEXT        NOT NULL,
  author_id   TEXT,
  author_name TEXT,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages (ticket_id, id);

-- Сборы на вайп: параметры и ответы игроков (буду / опаздываю / не буду)
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  channel_id  TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  role_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сообщение сбора, которое бот обновляет (текст «через N часов»)
ALTER TABLE events ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id    BIGINT      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- Профили принятых игроков: Steam ID, Telegram и привязка к Discord
CREATE TABLE IF NOT EXISTS user_profiles (
  id          BIGSERIAL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  username    TEXT        NOT NULL,
  steam       TEXT,
  telegram    TEXT,
  ticket_id   BIGINT      REFERENCES tickets (id) ON DELETE SET NULL,
  accepted_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_guild_user_key UNIQUE (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_profiles_guild_idx ON user_profiles (guild_id);

-- Оповещения о стримах: последний ID стрима, чтобы не дублировать оповещения
CREATE TABLE IF NOT EXISTS stream_alerts (
  streamer_login TEXT PRIMARY KEY,
  last_stream_id TEXT NOT NULL,
  notified_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Настройки канала для стримов на каждом сервере Discord
CREATE TABLE IF NOT EXISTS stream_guild_settings (
  guild_id          TEXT PRIMARY KEY,
  channel_id        TEXT,
  ping_role         TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Отслеживаемые каналы стримеров на сервере
CREATE TABLE IF NOT EXISTS stream_tracked_channels (
  guild_id          TEXT NOT NULL,
  streamer_login    TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, streamer_login)
);
`;

export function createDb(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });

  return {
    async init() {
      await pool.query(SCHEMA);
    },

    async findActiveTicketByUser(userId) {
      const { rows } = await pool.query(
        `SELECT * FROM tickets WHERE user_id = $1 AND status <> 'closed' LIMIT 1`,
        [userId],
      );
      return rows[0] ?? null;
    },

    async findTicketByChannel(channelId) {
      const { rows } = await pool.query('SELECT * FROM tickets WHERE channel_id = $1', [channelId]);
      return rows[0] ?? null;
    },

    async createTicket({ guildId, channelId, userId, username, type, answers }) {
      const { rows } = await pool.query(
        `INSERT INTO tickets (guild_id, channel_id, user_id, username, ticket_type, answers)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [guildId, channelId, userId, username, type, JSON.stringify(answers)],
      );
      return rows[0];
    },

    async setStatus(channelId, status, decidedBy) {
      await pool.query(
        `UPDATE tickets SET status = $2, decided_by = $3, updated_at = now() WHERE channel_id = $1`,
        [channelId, status, decidedBy],
      );
    },

    // Тексты сообщений модераторов в тикете за последние `minutes` минут
    async recentStaffMessages(ticketId, minutes) {
      const { rows } = await pool.query(
        `SELECT content FROM ticket_messages
         WHERE ticket_id = $1 AND role = 'staff' AND created_at > now() - make_interval(mins => $2)
         ORDER BY id`,
        [ticketId, minutes],
      );
      return rows.map((row) => row.content);
    },

    async addMessage(ticketId, { role, authorId = null, authorName = null, content }) {
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, role, author_id, author_name, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [ticketId, role, authorId, authorName, content],
      );
    },

    // Последние `limit` сообщений тикета по порядку (это и есть память модели)
    async recentMessages(ticketId, limit) {
      const { rows } = await pool.query(
        `SELECT id, role, author_name, content FROM (
           SELECT id, role, author_name, content FROM ticket_messages
           WHERE ticket_id = $1 ORDER BY id DESC LIMIT $2
         ) AS last ORDER BY id ASC`,
        [ticketId, limit],
      );
      return rows;
    },

    async createEvent({ guildId, channelId, data, roleId }) {
      const { rows } = await pool.query(
        `INSERT INTO events (guild_id, channel_id, data, role_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [guildId, channelId, JSON.stringify(data), roleId],
      );
      return rows[0];
    },

    async getEvent(id) {
      const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async setRsvp(eventId, userId, status) {
      await pool.query(
        `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
        [eventId, userId, status],
      );
    },

    async eventRsvps(eventId) {
      const { rows } = await pool.query('SELECT user_id, status FROM event_rsvps WHERE event_id = $1', [eventId]);
      return rows;
    },

    async setEventMessage(eventId, messageId) {
      await pool.query('UPDATE events SET message_id = $2 WHERE id = $1', [eventId, messageId]);
    },

    // Сборы с опубликованным сообщением, которые ещё не прошли раньше чем `sinceUnix`
    async activeEvents(sinceUnix) {
      const { rows } = await pool.query(
        `SELECT * FROM events
         WHERE message_id IS NOT NULL AND (data->>'startsUnix')::bigint >= $1`,
        [sinceUnix],
      );
      return rows;
    },

    async saveProfile({ guildId, userId, username, steam, telegram, ticketId = null, acceptedBy = null }) {
      const { rows } = await pool.query(
        `INSERT INTO user_profiles (guild_id, user_id, username, steam, telegram, ticket_id, accepted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
           username = EXCLUDED.username,
           steam = COALESCE(EXCLUDED.steam, user_profiles.steam),
           telegram = COALESCE(EXCLUDED.telegram, user_profiles.telegram),
           ticket_id = COALESCE(EXCLUDED.ticket_id, user_profiles.ticket_id),
           accepted_by = COALESCE(EXCLUDED.accepted_by, user_profiles.accepted_by),
           updated_at = now()
         RETURNING *`,
        [guildId, userId, username, steam, telegram, ticketId, acceptedBy],
      );
      return rows[0];
    },

    async listProfiles(guildId) {
      const { rows } = await pool.query(
        `SELECT * FROM user_profiles WHERE guild_id = $1 ORDER BY id ASC`,
        [guildId],
      );
      return rows;
    },

    async deleteProfile(guildId, userId) {
      await pool.query('DELETE FROM user_profiles WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
    },

    async getLastStreamAlert(login) {
      const { rows } = await pool.query(
        'SELECT last_stream_id FROM stream_alerts WHERE streamer_login = $1',
        [login],
      );
      return rows[0]?.last_stream_id ?? null;
    },

    async setLastStreamAlert(login, streamId) {
      await pool.query(
        `INSERT INTO stream_alerts (streamer_login, last_stream_id, notified_at)
         VALUES ($1, $2, now())
         ON CONFLICT (streamer_login) DO UPDATE SET
           last_stream_id = EXCLUDED.last_stream_id,
           notified_at = now()`,
        [login, streamId],
      );
    },

    // Отслеживаемые стримеры на сервере
    async getTrackedStreamers(guildId) {
      const { rows } = await pool.query(
        'SELECT streamer_login FROM stream_tracked_channels WHERE guild_id = $1 ORDER BY streamer_login ASC',
        [guildId],
      );
      return rows.map((r) => r.streamer_login);
    },

    async addTrackedStreamer(guildId, login) {
      await pool.query(
        `INSERT INTO stream_tracked_channels (guild_id, streamer_login)
         VALUES ($1, $2)
         ON CONFLICT (guild_id, streamer_login) DO NOTHING`,
        [guildId, login],
      );
    },

    async removeTrackedStreamer(guildId, login) {
      const { rowCount } = await pool.query(
        'DELETE FROM stream_tracked_channels WHERE guild_id = $1 AND streamer_login = $2',
        [guildId, login],
      );
      return (rowCount ?? 0) > 0;
    },

    async getAllTrackedStreamers() {
      const { rows } = await pool.query(
        'SELECT DISTINCT streamer_login FROM stream_tracked_channels',
      );
      return rows.map((r) => r.streamer_login);
    },

    async getStreamGuildSettings(guildId) {
      const { rows } = await pool.query(
        'SELECT * FROM stream_guild_settings WHERE guild_id = $1',
        [guildId],
      );
      return rows[0] ?? null;
    },

    async setStreamGuildChannel(guildId, channelId) {
      await pool.query(
        `INSERT INTO stream_guild_settings (guild_id, channel_id, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = now()`,
        [guildId, channelId],
      );
    },

    async removeStreamGuildChannel(guildId) {
      await pool.query(
        `UPDATE stream_guild_settings SET channel_id = NULL, updated_at = now() WHERE guild_id = $1`,
        [guildId],
      );
    },

    async close() {
      await pool.end();
    },
  };
}
