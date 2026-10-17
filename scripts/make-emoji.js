// Генерирует PNG-эмодзи для кнопок сбора в assets/emoji. Запуск: node scripts/make-emoji.js
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { renderIcon } from '../src/banner.js';
import { EVENT_EMOJI } from '../src/events-emoji.js';

const dir = new URL('../assets/emoji/', import.meta.url);
mkdirSync(dir, { recursive: true });
// Убираем картинки прошлых наборов, чтобы в assets не оставалось неиспользуемых файлов
for (const file of readdirSync(dir)) rmSync(new URL(file, dir));

for (const [name, icon] of Object.entries(EVENT_EMOJI)) {
  writeFileSync(new URL(`${name}.png`, dir), await renderIcon(icon));
  console.log(`assets/emoji/${name}.png`);
}
