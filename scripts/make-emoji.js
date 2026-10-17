// Генерирует PNG-эмодзи для кнопок сбора в assets/emoji. Запуск: node scripts/make-emoji.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderIcon } from '../src/banner.js';
import { EVENT_EMOJI } from '../src/events-emoji.js';

const dir = new URL('../assets/emoji/', import.meta.url);
mkdirSync(dir, { recursive: true });

for (const [name, { symbol, color }] of Object.entries(EVENT_EMOJI)) {
  writeFileSync(new URL(`${name}.png`, dir), await renderIcon(symbol, color));
  console.log(`assets/emoji/${name}.png`);
}
