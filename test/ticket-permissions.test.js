import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicketBot } from '../src/tickets.js';

test('createTicketBot экспортирует ensureOpenTicketPermissions', () => {
  const fakeClient = { user: { id: 'bot-123' } };
  const fakeDb = {
    findOpenTickets: async () => [],
  };
  const bot = createTicketBot({
    client: fakeClient,
    db: fakeDb,
    ai: {},
    servers: [],
  });

  assert.equal(typeof bot.ensureOpenTicketPermissions, 'function');
});

test('ensureOpenTicketPermissions выдаёт SendMessagesInThreads и права на вложения для открытых веток-тикетов', async () => {
  let createdOverwrite = null;
  let addedMember = null;

  const fakeParent = {
    permissionOverwrites: {
      create: async (userId, perms, options) => {
        createdOverwrite = { userId, perms, options };
      },
    },
  };

  const fakeThread = {
    id: 'thread-999',
    isThread: () => true,
    parent: fakeParent,
    members: {
      add: async (userId) => {
        addedMember = userId;
      },
    },
  };

  const fakeClient = {
    user: { id: 'bot-123' },
    channels: {
      fetch: async (id) => (id === 'thread-999' ? fakeThread : null),
    },
  };

  const fakeDb = {
    findOpenTickets: async () => [
      { id: 42, channel_id: 'thread-999', user_id: 'user-777', guild_id: 'guild-111' },
    ],
  };

  const bot = createTicketBot({
    client: fakeClient,
    db: fakeDb,
    ai: {},
    servers: [],
  });

  await bot.ensureOpenTicketPermissions();

  assert.equal(addedMember, 'user-777');
  assert.ok(createdOverwrite);
  assert.equal(createdOverwrite.userId, 'user-777');
  assert.equal(createdOverwrite.perms.SendMessagesInThreads, true);
  assert.equal(createdOverwrite.perms.AttachFiles, true);
  assert.equal(createdOverwrite.perms.EmbedLinks, true);
  assert.equal(createdOverwrite.perms.ReadMessageHistory, true);
  assert.equal(createdOverwrite.perms.ViewChannel, true);
});
