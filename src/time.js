// การจัดการเวลาและวัน — เก็บเวลาเป็น "นาทีนับจากเที่ยงคืน" เพื่อให้เปรียบเทียบง่าย

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const DAY_LABELS = {
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัสบดี',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
  SUN: 'อาทิตย์',
};

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** "09:30" -> 570. โยน Error ถ้ารูปแบบผิด */
export function parseTime(text) {
  const m = TIME_RE.exec(String(text).trim());
  if (!m) throw new Error(`รูปแบบเวลาไม่ถูกต้อง: "${text}" (ต้องเป็น HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`เวลาไม่มีอยู่จริง: "${text}"`);
  return h * 60 + min;
}

/** 570 -> "09:30" */
export function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isValidDay(day) {
  return DAYS.includes(day);
}
