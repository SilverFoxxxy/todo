export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = вс, 1 = пн, ..., 6 = сб
  // Сколько дней нужно отнять, чтобы получить понедельник:
  const diff = (day + 6) % 7; // для пн=0, вт=1, ..., вс=6
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekKey(date) {
  const monday = getMonday(date); // всегда понедельник
  const yearStart = new Date(monday.getFullYear(), 0, 1);
  if (isNaN(yearStart)) {
    console.error('Invalid monday date', date, monday);
    return 'todo-week-unknown'; // fallback
  }
  // Разница в днях между понедельником и началом года
  const diffDays = Math.floor((monday - yearStart) / 86400000);
  const weekNum = Math.floor(diffDays / 7); // порядковый номер понедельника
  return `todo-week-${monday.getFullYear()}-W${String(weekNum + 2).padStart(2, '0')}`;
}

export function toDateStr(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDayName(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase();
}
