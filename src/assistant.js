import { readFileSync } from 'node:fs';
import { findType } from './form.js';

const systemPrompt = readFileSync(new URL('../config/system-prompt.md', import.meta.url), 'utf8').trim();

export const greetingRequest = (type) =>
  `Заявка только что создана (тип: ${type.name}). Напиши короткое приветствие (3–4 предложения): поблагодари за анкету, ` +
  `скажи, что ${type.nextStep}, и предложи задать вопросы, если они есть. Не обещай принятие.`;

const STATUS_TITLES = {
  open: 'заявка получена, ждёт рассмотрения',
  in_review: 'взята на рассмотрение модераторами',
  call: 'игрок вызван на обзвон',
  accepted: 'принята',
  rejected: 'отклонена',
  closed: 'закрыта',
};

export const statusTitle = (status) => STATUS_TITLES[status] ?? status;

function describeApplication(ticket) {
  const answers = ticket.answers.map((answer) => `- ${answer.label} ${answer.value || '—'}`).join('\n');
  const typeName = findType(ticket.ticket_type)?.name ?? ticket.ticket_type;
  return [
    `Тип заявки: ${typeName}`,
    `Игрок: ${ticket.username}`,
    `Статус заявки: ${statusTitle(ticket.status)}`,
    'Анкета:',
    answers,
  ].join('\n');
}

function toChatMessage(message) {
  switch (message.role) {
    case 'assistant':
      return { role: 'assistant', content: message.content };
    case 'staff':
      return { role: 'user', content: `[Модератор ${message.author_name}]: ${message.content}` };
    case 'system':
      return { role: 'user', content: `[Система]: ${message.content}` };
    default:
      return { role: 'user', content: message.content };
  }
}

// Собирает запрос к модели: системный промпт, данные заявки и последние сообщения тикета
export function buildMessages(ticket, history) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Данные заявки этого игрока:\n${describeApplication(ticket)}` },
    ...history.map(toChatMessage),
  ];
}
