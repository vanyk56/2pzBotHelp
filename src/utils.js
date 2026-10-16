// Имя канала: строчные буквы (кириллица допустима), цифры, дефисы
export function slugify(name, fallback) {
  const slug = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

// Делит длинный текст на куски, которые влезают в одно сообщение Discord (лимит 2000)
export function splitMessage(text, limit = 1900) {
  const chunks = [];
  let rest = text.trim();

  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < 1) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}
