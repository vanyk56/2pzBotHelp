import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdeaMessagePayload,
  buildIdeaModal,
  buildIdeasPanelPayload,
  IDEAS_COMMANDS,
} from '../src/ideas.js';

test('IDEAS_COMMANDS содержит корректно настроенные субкоманды panel и set-channel', () => {
  const ideasCmd = IDEAS_COMMANDS.find((c) => c.name === 'ideas');
  assert.ok(ideasCmd);
  const panelSub = ideasCmd.options.find((o) => o.name === 'panel');
  const setChannelSub = ideasCmd.options.find((o) => o.name === 'set-channel');

  assert.ok(panelSub);
  assert.ok(setChannelSub);
  assert.ok(setChannelSub.options.some((o) => o.name === 'channel' && o.required));
});

test('buildIdeasPanelPayload создает красивый embed и кнопку предложения', () => {
  const payload = buildIdeasPanelPayload();
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components.length, 1);
  const btn = payload.components[0].toJSON().components[0];
  assert.equal(btn.label, 'Предложить идею');
  assert.equal(btn.custom_id, 'idea:open_modal');
});

test('buildIdeaModal создает модалку с полями заголовка и описания', () => {
  const modal = buildIdeaModal().toJSON();
  assert.equal(modal.custom_id, 'idea:submit_modal');
  assert.equal(modal.components.length, 2);
  const titleField = modal.components[0].components[0];
  const contentField = modal.components[1].components[0];
  assert.equal(titleField.custom_id, 'title');
  assert.equal(contentField.custom_id, 'content');
});

test('buildIdeaMessagePayload формирует сообщение идеи с кнопками голосования', () => {
  const idea = {
    id: 10,
    user_id: '123456789',
    username: 'RustPro',
    title: 'Турнир 2x2 на арене',
    content: 'Предлагаю устроить внутриклановый турнир в субботу вечером.',
    created_at: new Date('2026-10-28T02:00:00Z'),
  };

  const payload = buildIdeaMessagePayload({
    idea,
    yesCount: 5,
    noCount: 1,
    guildName: '2pz Clan',
  });

  assert.equal(payload.embeds.length, 1);
  const embed = payload.embeds[0].toJSON();
  assert.ok(embed.title.includes('Турнир 2x2'));
  assert.ok(embed.description.includes('внутриклановый турнир'));
  assert.ok(embed.fields.some((f) => f.name === '👤 Автор' && f.value.includes('123456789')));

  const btns = payload.components[0].toJSON().components;
  assert.equal(btns.length, 2);
  assert.equal(btns[0].label, '5'); // yesCount
  assert.equal(btns[1].label, '1'); // noCount
  assert.ok(btns[0].custom_id.includes('yes:10'));
  assert.ok(btns[1].custom_id.includes('no:10'));
});
