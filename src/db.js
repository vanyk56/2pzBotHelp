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

    async createTicket({ guildId, channelId, userId, username, answers }) {
      const { rows } = await pool.query(
        `INSERT INTO tickets (guild_id, channel_id, user_id, username, answers)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [guildId, channelId, userId, username, JSON.stringify(answers)],
      );
      return rows[0];
    },

    async setStatus(channelId, status, decidedBy) {
      await pool.query(
        `UPDATE tickets SET status = $2, decided_by = $3, updated_at = now() WHERE channel_id = $1`,
        [channelId, status, decidedBy],
      );
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

    async close() {
      await pool.end();
    },
  };
}
