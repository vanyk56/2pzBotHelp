import { readFileSync } from 'node:fs';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

// Лимиты Discord: в модалке до 5 полей, подпись до 45 символов, заголовок до 45
const MAX_FIELDS = 5;
const MAX_LABEL = 45;
const MAX_TITLE = 45;

export const FORM_MODAL_ID = 'ticket:form';

export function loadForm(url) {
  const form = JSON.parse(readFileSync(url, 'utf8'));

  if (!form.title || form.title.length > MAX_TITLE) {
    throw new Error(`Заголовок анкеты должен быть от 1 до ${MAX_TITLE} символов`);
  }
  if (!Array.isArray(form.fields) || form.fields.length === 0) {
    throw new Error('В form.json нет полей анкеты');
  }
  if (form.fields.length > MAX_FIELDS) {
    throw new Error(`В анкете не больше ${MAX_FIELDS} полей (лимит Discord)`);
  }

  const ids = new Set();
  for (const field of form.fields) {
    if (!/^[a-z0-9_]{1,50}$/.test(field.id)) {
      throw new Error(`Поле «${field.id}»: id может содержать только a-z, 0-9 и _`);
    }
    if (ids.has(field.id)) throw new Error(`Повторяется id поля «${field.id}»`);
    ids.add(field.id);
    if (!field.label || field.label.length > MAX_LABEL) {
      throw new Error(`Подпись «${field.label}» должна быть от 1 до ${MAX_LABEL} символов`);
    }
  }

  return form;
}

export const form = loadForm(new URL('../config/form.json', import.meta.url));

export function buildFormModal(formConfig = form) {
  const rows = formConfig.fields.map((field) => {
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

  return new ModalBuilder().setCustomId(FORM_MODAL_ID).setTitle(formConfig.title).addComponents(rows);
}

// Ответы в виде [{ id, label, value }], чтобы заявка читалась даже после правки form.json
export function readAnswers(modalSubmit, formConfig = form) {
  return formConfig.fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: modalSubmit.fields.getTextInputValue(field.id).trim(),
  }));
}

// Проверяет смысл ответов: не «1», не случайный набор цифр. Возвращает [{ label, problem }]
export function validateAnswers(answers, formConfig = form) {
  const problems = [];
  for (const field of formConfig.fields) {
    const answer = answers.find((a) => a.id === field.id);
    const problem = checkValue(field, answer?.value ?? '');
    if (problem) problems.push({ label: field.label, problem });
  }
  return problems;
}

function checkValue(field, value) {
  if (!value) return field.required === false ? null : 'поле не заполнено';
  if (field.minLength && value.length < field.minLength) {
    return `слишком короткий ответ, нужно минимум ${field.minLength} симв.`;
  }
  if (field.requireDigit && !/\d/.test(value)) return 'укажите число';
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
