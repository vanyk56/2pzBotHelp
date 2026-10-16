import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../src/ai.js';
import { buildMessages } from '../src/assistant.js';

const ticket = {
  username: 'florikrossee',
  status: 'open',
  answers: [{ id: 'hours', label: 'Сколько у вас часов?', value: '4к' }],
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('клиент шлёт запрос в формате chat/completions и возвращает текст ответа', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return jsonResponse({ choices: [{ message: { content: '  Здравствуйте!  ' } }] });
  };
  const ai = createAiClient({
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'test-key',
    model: 'zai-org/GLM-5.3-Flash',
    maxTokens: 300,
    fetchImpl,
  });

  const reply = await ai.complete([{ role: 'user', content: 'привет' }]);

  assert.equal(reply, 'Здравствуйте!');
  assert.equal(captured.url, 'https://api.example.test/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer test-key');
  assert.equal(captured.body.model, 'zai-org/GLM-5.3-Flash');
  assert.equal(captured.body.max_tokens, 300);
});

test('HTTP-ошибка и пустой ответ превращаются в исключение', async () => {
  const failing = createAiClient({
    baseUrl: 'https://x', apiKey: 'k', model: 'm', maxTokens: 10,
    fetchImpl: async () => new Response('limit exceeded', { status: 429 }),
  });
  await assert.rejects(failing.complete([]), /AI HTTP 429/);

  const empty = createAiClient({
    baseUrl: 'https://x', apiKey: 'k', model: 'm', maxTokens: 10,
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: '' } }] }),
  });
  await assert.rejects(empty.complete([]), /пустой ответ/);
});

test('сообщения модерации и системные события попадают в контекст с понятными пометками', () => {
  const messages = buildMessages(ticket, [
    { role: 'user', author_name: 'florikrossee', content: 'Когда ответите?' },
    { role: 'staff', author_name: 'Moder', content: 'Скоро позвоним' },
    { role: 'system', author_name: null, content: 'Статус заявки: игрок вызван на обзвон' },
    { role: 'assistant', author_name: '2pzbot', content: 'Ожидайте обзвона.' },
  ]);

  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content, /Статус заявки: заявка получена/);
  assert.match(messages[1].content, /Сколько у вас часов\? 4к/);
  assert.deepEqual(messages[3], { role: 'user', content: '[Модератор Moder]: Скоро позвоним' });
  assert.deepEqual(messages[4], { role: 'user', content: '[Система]: Статус заявки: игрок вызван на обзвон' });
  assert.deepEqual(messages[5], { role: 'assistant', content: 'Ожидайте обзвона.' });
});
