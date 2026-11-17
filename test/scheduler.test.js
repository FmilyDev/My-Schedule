import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, formatTime } from '../src/time.js';
import {
  sessionsOverlap,
  sectionsConflict,
  normalizeCourses,
  generateSchedules,
  rankSchedules,
  scheduleMetrics,
} from '../src/scheduler.js';

// ตัวช่วยสร้างข้อมูล: sec('1', ['MON','09:00','10:00'], ...)
const sec = (id, ...sessions) => ({
  id,
  sessions: sessions.map(([day, start, end, room = '']) => ({ day, start, end, room })),
});
const course = (code, ...sections) => ({ code, name: code, sections });
const norm = (raw) => {
  const { courses, errors } = normalizeCourses(raw);
  assert.deepEqual(errors, []);
  return courses;
};
const picks = (schedule) => schedule.map(({ course: c, section: s }) => `${c.code}:${s.id}`).join(' ');

// ---------- เวลา ----------

test('parseTime / formatTime', () => {
  assert.equal(parseTime('09:30'), 570);
  assert.equal(parseTime('9:05'), 545);
  assert.equal(formatTime(570), '09:30');
  assert.throws(() => parseTime('25:00'));
  assert.throws(() => parseTime('9.30'));
  assert.throws(() => parseTime(''));
});

// ---------- เวลาชน ----------

const s = (day, a, b) => ({ day, start: parseTime(a), end: parseTime(b) });

test('ชน: เวลาตรงกันเป๊ะ / ทับบางส่วน / อยู่ข้างในทั้งหมด', () => {
  assert.ok(sessionsOverlap(s('MON', '09:00', '10:00'), s('MON', '09:00', '10:00')));
  assert.ok(sessionsOverlap(s('MON', '09:00', '10:30'), s('MON', '10:00', '11:00')));
  assert.ok(sessionsOverlap(s('MON', '09:00', '12:00'), s('MON', '10:00', '11:00')));
});

test('ไม่ชน: คาบต่อกันพอดี และ เวลาเดียวกันคนละวัน', () => {
  assert.ok(!sessionsOverlap(s('MON', '09:00', '10:00'), s('MON', '10:00', '11:00')));
  assert.ok(!sessionsOverlap(s('MON', '09:00', '10:00'), s('TUE', '09:00', '10:00')));
});

test('section ชนกันเพราะคาบที่ 2 แม้คาบแรกไม่ชน', () => {
  const [a, b] = norm([
    course('A', sec('1', ['MON', '09:00', '10:00'], ['WED', '13:00', '15:00'])),
    course('B', sec('1', ['TUE', '09:00', '10:00'], ['WED', '14:00', '16:00'])),
  ]);
  assert.ok(sectionsConflict(a.sections[0], b.sections[0]));
});

// ---------- ตรวจข้อมูล ----------

test('normalizeCourses จับข้อมูลผิดได้', () => {
  const { errors } = normalizeCourses([
    course('A', sec('1', ['MON', '10:00', '09:00'])), // เริ่มหลังจบ
    course('A', sec('1', ['XXX', '09:00', '10:00'])), // รหัสซ้ำ + วันผิด
    course('B'), // ไม่มี section
    course('C', sec('1')), // section ไม่มีคาบ
    course('D', sec('1', ['MON', '09:00', '10:00']), sec('1', ['TUE', '09:00', '10:00'])), // section ซ้ำ
    course('E', sec('1', ['MON', '09:00', '11:00'], ['MON', '10:00', '12:00'])), // ทับกันเองใน section
    course('', sec('1', ['MON', '09:00', '9:61'])), // ไม่มีรหัส + เวลาผิด
  ]);
  const has = (frag) => assert.ok(errors.some((e) => e.includes(frag)), `ไม่พบ error: ${frag}\n${errors.join('\n')}`);
  has('ต้องก่อนเวลาจบ');
  has('รหัสวิชา A ซ้ำ');
  has('วันไม่ถูกต้อง');
  has('B: ยังไม่มี section');
  has('ยังไม่มีคาบเรียน');
  has('section 1 ซ้ำ');
  has('ภายใน section เดียวกัน');
  has('ยังไม่ได้ใส่รหัสวิชา');
  has('เวลาไม่มีอยู่จริง');
});

// ---------- ค้นหา ----------

test('หาชุดที่ลงตัวได้ชุดเดียว', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '11:00']), sec('2', ['TUE', '09:00', '11:00'])),
    course('B', sec('1', ['MON', '10:00', '12:00'])),
  ]);
  const r = generateSchedules(courses);
  assert.equal(r.schedules.length, 1);
  assert.equal(picks(r.schedules[0]), 'A:2 B:1');
  assert.equal(r.diagnosis, null);
});

test('หาครบทุกชุดและเรียงผลตามลำดับวิชาเดิม', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00']), sec('3', ['WED', '09:00', '10:00'])),
    course('B', sec('1', ['MON', '09:00', '10:00'])), // วิชานี้มีตัวเลือกน้อยสุด จะถูกค้นก่อน แต่ผลต้องยังขึ้นต้นด้วย A
  ]);
  const r = generateSchedules(courses);
  assert.deepEqual(r.schedules.map(picks).sort(), ['A:2 B:1', 'A:3 B:1']);
});

test('ล็อก section แล้วโปรแกรมเลือกเฉพาะ section นั้น', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00'])),
    course('B', sec('1', ['WED', '09:00', '10:00']), sec('2', ['THU', '09:00', '10:00'])),
  ]);
  const r = generateSchedules(courses, { locks: { A: '2' } });
  assert.equal(r.schedules.length, 2);
  assert.ok(r.schedules.every((sch) => sch[0].section.id === '2'));
});

test('ล็อก section ที่ไม่มีอยู่ → error', () => {
  const courses = norm([course('A', sec('1', ['MON', '09:00', '10:00']))]);
  const r = generateSchedules(courses, { locks: { A: '9' } });
  assert.equal(r.schedules.length, 0);
  assert.ok(r.errors[0].includes('ไม่มี section นี้'));
});

test('ล็อก section ที่ชนกันเอง → วินิจฉัยเป็นคู่ที่ชน', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00'])),
    course('B', sec('1', ['MON', '09:00', '10:00']), sec('2', ['WED', '09:00', '10:00'])),
  ]);
  const r = generateSchedules(courses, { locks: { A: '1', B: '1' } });
  assert.equal(r.schedules.length, 0);
  assert.deepEqual(r.diagnosis.conflictingPairs, [['A', 'B']]);
});

test('ไม่มีชุดลงตัว: บอกคู่วิชาที่ทุก section ชนกัน', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00'])),
    // ทุก section ของ B มีคาบทั้งวันจันทร์และอังคาร จึงชนกับทุก section ของ A
    course(
      'B',
      sec('1', ['MON', '09:30', '10:30'], ['TUE', '09:30', '10:30']),
      sec('2', ['MON', '08:30', '09:30'], ['TUE', '08:30', '09:30']),
    ),
    course('C', sec('1', ['FRI', '09:00', '10:00'])),
  ]);
  const r = generateSchedules(courses);
  assert.equal(r.schedules.length, 0);
  assert.deepEqual(r.diagnosis.conflictingPairs, [['A', 'B']]);
});

test('ไม่มีชุดลงตัวแต่ไม่มีคู่ไหนชนหมด: บอกว่าตัดวิชาไหนแล้วลงตัว', () => {
  // A, B, C แต่ละคู่ลงด้วยกันได้ แต่ทั้งสามวิชาพร้อมกันไม่ได้ (เหมือนระบายสีกราฟสามเหลี่ยมด้วยสองสี)
  const X = ['MON', '09:00', '10:00'];
  const Y = ['TUE', '09:00', '10:00'];
  const courses = norm([
    course('A', sec('1', X), sec('2', Y)),
    course('B', sec('1', X), sec('2', Y)),
    course('C', sec('1', X), sec('2', Y)),
  ]);
  const r = generateSchedules(courses);
  assert.equal(r.schedules.length, 0);
  assert.deepEqual(r.diagnosis.conflictingPairs, []);
  assert.deepEqual(r.diagnosis.removableCourses, ['A', 'B', 'C']);
});

test('ข้อมูลใหญ่ต้องหยุดที่ limit และบอกว่าถูกตัด', () => {
  // 10 วิชา × 6 section ไม่มีอะไรชนกันเลย = 6^10 ≈ 60 ล้านชุด
  // ทุก section ของวิชาเดียวกันอยู่ช่องเวลาเดียวกัน แต่แต่ละวิชาได้ช่องเวลาไม่ซ้ำกัน
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const raw = Array.from({ length: 10 }, (_, i) => {
    const slot = [days[i % 5], `${8 + Math.floor(i / 5)}:00`, `${9 + Math.floor(i / 5)}:00`];
    return course(`C${i}`, ...Array.from({ length: 6 }, (_, k) => sec(String(k + 1), slot)));
  });
  const courses = norm(raw);
  const t0 = Date.now();
  const r = generateSchedules(courses, { limit: 1000 });
  assert.equal(r.schedules.length, 1000);
  assert.equal(r.truncated, true);
  assert.ok(Date.now() - t0 < 2000, 'ต้องจบเร็ว');
});

test('จำนวนพอดี limit ไม่ถือว่าถูกตัด', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00'])),
  ]);
  const r = generateSchedules(courses, { limit: 2 });
  assert.equal(r.schedules.length, 2);
  assert.equal(r.truncated, false);
});

test('ไม่มีวิชา → error', () => {
  const r = generateSchedules([]);
  assert.equal(r.schedules.length, 0);
  assert.ok(r.errors.length > 0);
});

// ---------- จัดอันดับ ----------

test('scheduleMetrics นับวัน ช่วงว่าง และคาบที่ผิดเงื่อนไขเวลา', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '08:00', '09:00'])),
    course('B', sec('1', ['MON', '11:00', '12:00'], ['TUE', '13:00', '17:00'])),
  ]);
  const [sch] = generateSchedules(courses).schedules;
  const m = scheduleMetrics(sch, { noBefore: parseTime('09:00'), noAfter: parseTime('16:00') });
  assert.equal(m.daysUsed, 2);
  assert.equal(m.totalGap, 120);
  assert.equal(m.violations, 2);
});

test('rankSchedules: ตั้งค่าวันว่าง → ชุดที่ใช้วันน้อยขึ้นก่อน', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '09:00', '10:00']), sec('2', ['TUE', '09:00', '10:00'])),
    course('B', sec('1', ['TUE', '13:00', '14:00'])),
  ]);
  const { schedules } = generateSchedules(courses);
  const ranked = rankSchedules(schedules, { preferDaysOff: true });
  assert.equal(picks(ranked[0].schedule), 'A:2 B:1');
  assert.equal(ranked[0].metrics.daysUsed, 1);
});

test('rankSchedules: ลดช่วงว่าง → ชุดที่คาบติดกันขึ้นก่อน', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '08:00', '09:00']), sec('2', ['MON', '12:00', '13:00'])),
    course('B', sec('1', ['MON', '13:00', '14:00'])),
  ]);
  const ranked = rankSchedules(generateSchedules(courses).schedules, { minimizeGaps: true });
  assert.equal(picks(ranked[0].schedule), 'A:2 B:1');
  assert.equal(ranked[0].metrics.totalGap, 0);
});

test('rankSchedules: ไม่เรียนก่อน 09:00 สำคัญกว่าเรื่องวันว่าง', () => {
  const courses = norm([
    course('A', sec('1', ['MON', '08:00', '09:00']), sec('2', ['TUE', '10:00', '11:00'])),
    course('B', sec('1', ['MON', '13:00', '14:00'])),
  ]);
  const ranked = rankSchedules(generateSchedules(courses).schedules, {
    preferDaysOff: true,
    noBefore: parseTime('09:00'),
  });
  assert.equal(picks(ranked[0].schedule), 'A:2 B:1');
});
