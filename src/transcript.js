import { AttachmentBuilder } from 'discord.js';
import { slugify } from './utils.js';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let res = escapeHtml(text);

  // Многострочный код ```lang\ncode```
  res = res.replace(/```(?:[a-z0-9_-]+)?\n([\s\S]*?)```/gi, (_, code) => `<pre><code>${code}</code></pre>`);

  // Однострочный код `code`
  res = res.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Жирный **text**
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Курсив *text* или _text_
  res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  res = res.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Зачёркнутый ~~text~~
  res = res.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Ссылки [text](url)
  res = res.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Упоминания <@123>, <#123>, <@&123>
  res = res.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@пользователь</span>');
  res = res.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@роль</span>');
  res = res.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#канал</span>');

  // Переносы строк
  res = res.replace(/\n/g, '<br/>');

  return res;
}

export function generateHtmlTranscript({
  ticket,
  type = null,
  guild = null,
  closedBy = null,
  messages = [],
}) {
  const typeName = type?.name || ticket?.ticket_type || 'Тикет';
  const ticketId = ticket?.id ? `#${ticket.id}` : '';
  const guildName = guild?.name || '2pz';
  const guildIcon = guild?.iconURL?.() || null;
  const username = ticket?.username || 'Игрок';
  const userId = ticket?.user_id || '—';

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const messagesHtml = sortedMessages
    .map((msg) => {
      const author = msg.author || {};
      const avatarUrl =
        typeof author.displayAvatarURL === 'function'
          ? author.displayAvatarURL({ size: 64 })
          : 'https://cdn.discordapp.com/embed/avatars/0.png';
      const isBot = Boolean(author.bot);
      const timeStr = new Date(msg.createdAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
      });

      const textHtml = formatMarkdown(msg.content);

      // Вложения
      const attachmentsHtml = Array.from(msg.attachments?.values?.() || [])
        .map((att) => {
          const isImg =
            att.contentType?.startsWith('image/') ||
            /\.(png|jpe?g|webp|gif)$/i.test(att.name || '');
          if (isImg) {
            return `
            <div class="msg-attachment">
              <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener">
                <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy" />
              </a>
            </div>`;
          }
          return `
          <div class="msg-attachment-file">
            <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener">
              📎 ${escapeHtml(att.name || 'Вложение')}
            </a>
          </div>`;
        })
        .join('');

      // Эмбеды
      const embedsHtml = (msg.embeds || [])
        .map((embed) => {
          const colorHex = embed.hexColor || '#5865f2';
          const titleHtml = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : '';
          const descHtml = embed.description ? `<div class="embed-desc">${formatMarkdown(embed.description)}</div>` : '';

          const fieldsHtml = (embed.fields || [])
            .map(
              (f) => `
              <div class="embed-field ${f.inline ? 'inline' : ''}">
                <div class="embed-field-name">${escapeHtml(f.name)}</div>
                <div class="embed-field-value">${formatMarkdown(f.value)}</div>
              </div>`,
            )
            .join('');

          return `
          <div class="embed" style="border-left-color: ${colorHex};">
            ${titleHtml}
            ${descHtml}
            ${fieldsHtml ? `<div class="embed-fields">${fieldsHtml}</div>` : ''}
          </div>`;
        })
        .join('');

      return `
      <div class="message">
        <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(author.username || 'User')}" />
        <div class="msg-body">
          <div class="msg-header">
            <span class="author-name">${escapeHtml(author.username || 'Пользователь')}</span>
            ${isBot ? '<span class="bot-tag">БОТ</span>' : ''}
            <span class="timestamp">${timeStr}</span>
          </div>
          ${textHtml ? `<div class="msg-content">${textHtml}</div>` : ''}
          ${attachmentsHtml}
          ${embedsHtml}
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Транскрипт тикета ${ticketId} · ${escapeHtml(typeName)}</title>
  <style>
    :root {
      --bg-primary: #313338;
      --bg-secondary: #2b2d31;
      --bg-tertiary: #1e1f22;
      --text-normal: #dbdee1;
      --text-muted: #949ba4;
      --text-header: #f2f3f5;
      --blurple: #5865f2;
      --font: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-primary);
      color: var(--text-normal);
      font-family: var(--font);
      font-size: 15px;
      line-height: 1.4;
      padding: 24px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--bg-secondary);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .header {
      padding: 20px 24px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--blurple);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      overflow: hidden;
    }
    .header-icon img { width: 100%; height: 100%; object-fit: cover; }
    .header-info h1 {
      font-size: 18px;
      color: var(--text-header);
      margin-bottom: 4px;
    }
    .header-meta {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-meta span strong { color: var(--text-normal); }
    .chat-container {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .message {
      display: flex;
      gap: 16px;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.1s ease;
    }
    .message:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .msg-body { flex: 1; min-width: 0; }
    .msg-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
    }
    .author-name {
      color: var(--text-header);
      font-weight: 600;
      font-size: 15px;
    }
    .bot-tag {
      background: var(--blurple);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .timestamp {
      color: var(--text-muted);
      font-size: 12px;
    }
    .msg-content {
      color: var(--text-normal);
      word-break: break-word;
    }
    .msg-content strong { color: var(--text-header); }
    .mention {
      background: rgba(88, 101, 242, 0.3);
      color: #c9cdfb;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 500;
    }
    pre {
      background: var(--bg-tertiary);
      padding: 8px 12px;
      border-radius: 4px;
      margin: 6px 0;
      overflow-x: auto;
      font-family: monospace;
      font-size: 13px;
    }
    code {
      background: var(--bg-tertiary);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 13px;
    }
    a { color: #00a8fc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .msg-attachment {
      margin-top: 8px;
      max-width: 450px;
      border-radius: 6px;
      overflow: hidden;
    }
    .msg-attachment img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 6px;
    }
    .msg-attachment-file {
      margin-top: 6px;
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      display: inline-block;
      font-size: 13px;
    }
    .embed {
      margin-top: 8px;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border-left: 4px solid var(--blurple);
      border-radius: 4px;
      max-width: 520px;
    }
    .embed-title {
      font-weight: 700;
      color: var(--text-header);
      margin-bottom: 6px;
      font-size: 15px;
    }
    .embed-desc {
      font-size: 14px;
      margin-bottom: 8px;
      color: var(--text-normal);
    }
    .embed-fields {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .embed-field {
      flex: 1 1 100%;
    }
    .embed-field.inline {
      flex: 1 1 calc(50% - 12px);
      min-width: 140px;
    }
    .embed-field-name {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .embed-field-value {
      font-size: 14px;
      color: var(--text-header);
    }
    .footer {
      padding: 16px 24px;
      background: var(--bg-tertiary);
      border-top: 1px solid rgba(255,255,255,0.06);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-icon">
        ${guildIcon ? `<img src="${escapeHtml(guildIcon)}" alt="${escapeHtml(guildName)}" />` : '🎫'}
      </div>
      <div class="header-info">
        <h1>${escapeHtml(typeName)} ${ticketId}</h1>
        <div class="header-meta">
          <span>Сервер: <strong>${escapeHtml(guildName)}</strong></span>
          <span>Игрок: <strong>${escapeHtml(username)}</strong> (${escapeHtml(userId)})</span>
          ${closedBy ? `<span>Закрыл: <strong>${escapeHtml(closedBy)}</strong></span>` : ''}
          <span>Сообщений: <strong>${sortedMessages.length}</strong></span>
        </div>
      </div>
    </div>

    <div class="chat-container">
      ${messagesHtml || '<p style="color: var(--text-muted); text-align: center;">В тикете нет сообщений.</p>'}
    </div>

    <div class="footer">
      Архив переписки сгенерирован ботом 2pz · ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)
    </div>
  </div>
</body>
</html>`;
}

export function buildTranscriptAttachment({ ticket, type, guild, closedBy, messages }) {
  const html = generateHtmlTranscript({ ticket, type, guild, closedBy, messages });
  const buffer = Buffer.from(html, 'utf8');
  const userSlug = slugify(ticket?.username || 'user');
  const filename = `тикет-${ticket?.id || 0}-${userSlug}.html`;

  return new AttachmentBuilder(buffer, { name: filename });
}
