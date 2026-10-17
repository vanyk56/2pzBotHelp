// Эмодзи для кнопок сбора. Имена — как у загруженных на сервер эмодзи (новые имена, старые event_* не используются).
// gradient — фон иконки, shapes — штрихи символа в системе координат 24×24.
export const EVENT_EMOJI = {
  ev_going: {
    gradient: 'linear-gradient(135deg, #43d17a 0%, #15a36a 100%)',
    shapes: [{ tag: 'path', d: 'M6.5 12.5l3.6 3.6L17.5 8.6' }],
  },
  ev_late: {
    gradient: 'linear-gradient(135deg, #ffd166 0%, #f59e0b 100%)',
    shapes: [
      { tag: 'circle', cx: 12, cy: 12, r: 7.5 },
      { tag: 'path', d: 'M12 8v4.6l3 1.8' },
    ],
  },
  ev_no: {
    gradient: 'linear-gradient(135deg, #ff7b7b 0%, #e02e46 100%)',
    shapes: [{ tag: 'path', d: 'M7.5 7.5l9 9M16.5 7.5l-9 9' }],
  },
  ev_check: {
    gradient: 'linear-gradient(135deg, #8f8bff 0%, #4a3fd6 100%)',
    shapes: [
      { tag: 'circle', cx: 10.5, cy: 10.5, r: 5.5 },
      { tag: 'path', d: 'M15 15l4.5 4.5' },
    ],
  },
};
