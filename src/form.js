import { readFileSync } from 'node:fs';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

// Лимиты Discord: в одном окне модалки до 5 полей, подпись до 45 символов, заголовок до 45.
// Если полей больше 5, анкета идёт в несколько окон (до двух): пользователь нажимает «Далее»
const STEP_SIZE = 5;
const MAX_STEPS = 2;
const MAX_FIELDS = STEP_SIZE * MAX_STEPS;
const MAX_LABEL = 45;
const MAX_TITLE = 45;

export const FORM_MODAL_PREFIX = 'ticket:form:';

function validateFields(type) {
  if (!Array.isArray(type.fields) || type.fields.length === 0) {
    throw new Error(`Тип «${type.id}»: нет полей анкеты`);
  }
  if (type.fields.length > MAX_FIELDS) {
    throw new Error(`Тип «${type.id}»: в анкете не больше ${MAX_FIELDS} полей (два окна по ${STEP_SIZE})`);
  }

  const ids = new Set();
  for (const field of type.fields) {
    if (!/^[a-z0-9_]{1,50}$/.test(field.id)) {
      throw new Error(`Поле «${field.id}»: id может содержать только a-z, 0-9 и _`);
    }
    if (ids.has(field.id)) throw new Error(`Тип «${type.id}»: повторяется id поля «${field.id}»`);
    ids.add(field.id);
    if (!field.label || field.label.length > MAX_LABEL) {
      throw new Error(`Подпись «${field.label}» должна быть от 1 до ${MAX_LABEL} символов`);
    }
  }
}

export function loadTicketConfig(url) {
  const data = JSON.parse(readFileSync(url, 'utf8'));
  if (!data.panels || !Array.isArray(data.types) || data.types.length === 0) {
    throw new Error('tickets.json: нужны разделы panels и types');
  }

  const typeIds = new Set();
  for (const type of data.types) {
    if (!/^[a-z0-9_]{1,30}$/.test(type.id)) {
      throw new Error(`Тип «${type.id}»: id может содержать только a-z, 0-9 и _`);
    }
    if (typeIds.has(type.id)) throw new Error(`Повторяется тип «${type.id}»`);
    typeIds.add(type.id);
    if (!type.title || type.title.length > MAX_TITLE) {
      throw new Error(`Тип «${type.id}»: заголовок должен быть от 1 до ${MAX_TITLE} символов`);
    }
    validateFields(type);
  }

  return data;
}

export const ticketConfig = loadTicketConfig(new URL('../config/tickets.json', import.meta.url));
export const ticketTypes = ticketConfig.types;
export const findType = (id) => ticketTypes.find((type) => type.id === id) ?? null;

// Сколько окон у анкеты и какие поля в окне step (с нуля)
export const formStepCount = (type) => Math.ceil(type.fields.length / STEP_SIZE);
export const formStepFields = (type, step) => type.fields.slice(step * STEP_SIZE, step * STEP_SIZE + STEP_SIZE);

// customId модалки: ticket:form:<тип>:<номер окна>
export function parseFormId(customId) {
  const [typeId, step] = customId.slice(FORM_MODAL_PREFIX.length).split(':');
  return { typeId, step: Number(step) };
}

export function buildFormModal(type, step = 0) {
  const fields = formStepFields(type, step);
  const rows = fields.map((field) => {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false)
      .setMaxLength(field.maxLength ?? 1000);

    if (field.minLength) input.setMinLength(field.minLength);
    if (field.placeholder) input.setPlaceholder(field.placeholder);
    return new ActionRowBuilder().addComponents(input);
  });

  const count = formStepCount(type);
  const title = count > 1 ? `${type.title} (${step + 1}/${count})` : type.title;
  return new ModalBuilder()
    .setCustomId(`${FORM_MODAL_PREFIX}${type.id}:${step}`)
    .setTitle(title)
    .addComponents(rows);
}

// Ответы в виде [{ id, label, value }], чтобы заявка читалась даже после правки конфига
export function readAnswers(modalSubmit, type) {
  return type.fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: modalSubmit.fields.getTextInputValue(field.id).trim(),
  }));
}

// Проверяет смысл ответов: не «1», не случайный набор символов. Возвращает [{ label, problem }]
export function validateAnswers(answers, type) {
  const problems = [];
  for (const field of type.fields) {
    const answer = answers.find((a) => a.id === field.id);
    const problem = checkValue(field, answer?.value ?? '');
    if (problem) problems.push({ label: field.label, problem });
  }
  return problems;
}

const LINK_PATTERN = /https?:\/\/|www\.|[\w-]+\.[a-z]{2,}/i;

function checkValue(field, value) {
  if (!value) return field.required === false ? null : 'поле не заполнено';
  if (field.minLength && value.length < field.minLength) {
    return `слишком короткий ответ, нужно минимум ${field.minLength} симв.`;
  }
  if (field.pattern && !new RegExp(field.pattern, 'i').test(value)) {
    return field.patternHint ?? 'неверный формат';
  }
  if (field.requireDigit && !/\d/.test(value)) return 'укажите число';
  if (field.requireLink && !LINK_PATTERN.test(value)) return 'нужна ссылка, например https://…';
  if (field.numberRange) {
    const [min, max] = field.numberRange;
    const match = value.match(/\d+/);
    const number = match ? Number(match[0]) : NaN;
    if (!(number >= min && number <= max)) return `укажите число от ${min} до ${max}`;
  }
  if (field.minWords && (value.match(/\p{L}{2,}/gu) ?? []).length < field.minWords) {
    return `напишите подробнее, нужно минимум ${field.minWords} слова`;
  }
  return null;
}
