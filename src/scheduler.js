// ตรรกะหลักของการจัดตาราง: ตรวจข้อมูล, ตรวจเวลาชน, ค้นหาชุด section ที่ลงตัว,
// วินิจฉัยเมื่อหาไม่ได้ และจัดอันดับผลลัพธ์
//
// รูปแบบข้อมูลที่รับเข้า (เวลาเป็นข้อความ "HH:MM"):
//   Course  { code, name, sections: [Section] }
//   Section { id, sessions: [Session] }
//   Session { day: 'MON'..'SUN', start: '09:00', end: '10:30', room }

import { parseTime, isValidDay, DAY_LABELS, formatTime } from './time.js';

export const DEFAULT_LIMIT = 5000;

/** ช่วงเวลาสองช่วงทับกันไหม — คาบที่ต่อกันพอดี (จบ 10:00 / เริ่ม 10:00) ไม่นับว่าชน */
export function sessionsOverlap(a, b) {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

/** section สองตัวชนกันถ้ามีคาบใดคาบหนึ่งทับกัน */
export function sectionsConflict(a, b) {
  for (const x of a.sessions) {
    for (const y of b.sessions) {
      if (sessionsOverlap(x, y)) return true;
    }
  }
  return false;
}

function describeSession(s) {
  return `${DAY_LABELS[s.day] ?? s.day} ${formatTime(s.start)}–${formatTime(s.end)}`;
}

/**
 * ตรวจและแปลงข้อมูลดิบ (เวลาเป็นข้อความ) ให้เป็นข้อมูลภายใน (เวลาเป็นนาที)
 * คืน { courses, errors } — ถ้า errors ไม่ว่าง ไม่ควรนำ courses ไปค้นหา
 */
export function normalizeCourses(rawCourses) {
  const errors = [];
  const seenCodes = new Set();
  const courses = [];

  if (!Array.isArray(rawCourses)) {
    return { courses: [], errors: ['ข้อมูลวิชาต้องเป็นรายการ (array)'] };
  }

  rawCourses.forEach((raw, ci) => {
    const code = String(raw?.code ?? '').trim();
    const name = String(raw?.name ?? '').trim();
    const label = code || `วิชาลำดับที่ ${ci + 1}`;

    if (!code) errors.push(`${label}: ยังไม่ได้ใส่รหัสวิชา`);
    else if (seenCodes.has(code)) errors.push(`รหัสวิชา ${code} ซ้ำกัน`);
    seenCodes.add(code);

    const rawSections = Array.isArray(raw?.sections) ? raw.sections : [];
    if (rawSections.length === 0) errors.push(`${label}: ยังไม่มี section`);

    const seenIds = new Set();
    const sections = rawSections.map((rs, si) => {
      const id = String(rs?.id ?? '').trim();
      const secLabel = `${label} sec ${id || `(ลำดับที่ ${si + 1})`}`;
      if (!id) errors.push(`${secLabel}: ยังไม่ได้ใส่หมายเลข section`);
      else if (seenIds.has(id)) errors.push(`${label}: section ${id} ซ้ำกัน`);
      seenIds.add(id);

      const rawSessions = Array.isArray(rs?.sessions) ? rs.sessions : [];
      if (rawSessions.length === 0) errors.push(`${secLabel}: ยังไม่มีคาบเรียน`);

      const sessions = [];
      rawSessions.forEach((r) => {
        if (!isValidDay(r?.day)) {
          errors.push(`${secLabel}: วันไม่ถูกต้อง "${r?.day}"`);
          return;
        }
        let start;
        let end;
        try {
          start = parseTime(r.start);
          end = parseTime(r.end);
        } catch (e) {
          errors.push(`${secLabel}: ${e.message}`);
          return;
        }
        if (start >= end) {
          errors.push(`${secLabel}: เวลาเริ่ม (${r.start}) ต้องก่อนเวลาจบ (${r.end})`);
          return;
        }
        sessions.push({ day: r.day, start, end, room: String(r?.room ?? '').trim() });
      });

      // คาบภายใน section เดียวกันห้ามทับกันเอง (มักเป็นข้อมูลกรอกผิด)
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          if (sessionsOverlap(sessions[i], sessions[j])) {
            errors.push(
              `${secLabel}: คาบ ${describeSession(sessions[i])} ทับกับ ${describeSession(sessions[j])} ภายใน section เดียวกัน`,
            );
          }
        }
      }

      return { id, sessions };
    });

    courses.push({ code, name: name || code, sections });
  });

  return { courses, errors };
}

/** สร้างตัวเลือก section ของแต่ละวิชาหลังใส่ล็อก */
function applyLocks(courses, locks) {
  const errors = [];
  const options = courses.map((course, idx) => {
    const lockedId = locks?.[course.code];
    if (lockedId == null || lockedId === '') return { idx, course, sections: course.sections };
    const sections = course.sections.filter((s) => s.id === lockedId);
    if (sections.length === 0) errors.push(`ล็อก ${course.code} sec ${lockedId} ไว้ แต่ไม่มี section นี้`);
    return { idx, course, sections };
  });
  return { options, errors };
}

/** แกนการค้นหาแบบ backtracking (ใช้ภายใน) */
function search(options, limit) {
  const n = options.length;
  // เรียงวิชาที่มีตัวเลือกน้อยไว้ก่อน → ตัดกิ่งที่เป็นไปไม่ได้ได้เร็ว
  const order = [...options].sort((a, b) => a.sections.length - b.sections.length);

  // คำนวณคู่ที่ชนกันล่วงหน้า
  const conflictCache = new Map();
  const conflicts = (a, b) => {
    let row = conflictCache.get(a);
    if (!row) conflictCache.set(a, (row = new Map()));
    if (!row.has(b)) row.set(b, sectionsConflict(a, b));
    return row.get(b);
  };

  const chosen = new Array(n);
  const stack = [];
  const results = [];
  let truncated = false;

  const bt = (i) => {
    if (i === order.length) {
      if (results.length >= limit) {
        truncated = true;
        return;
      }
      results.push(options.map((o) => ({ course: o.course, section: chosen[o.idx] })));
      return;
    }
    const opt = order[i];
    for (const sec of opt.sections) {
      if (stack.every((other) => !conflicts(sec, other))) {
        chosen[opt.idx] = sec;
        stack.push(sec);
        bt(i + 1);
        stack.pop();
        if (truncated) return;
      }
    }
  };

  bt(0);
  // ผลลัพธ์ต้องเรียงตามลำดับวิชาเดิม (options เรียงตาม idx อยู่แล้ว)
  return { results, truncated };
}

/**
 * หาวิธีอธิบายว่าทำไมไม่มีชุดที่ลงตัว
 * - emptyCourses: วิชาที่ไม่เหลือ section ให้เลือก
 * - conflictingPairs: คู่วิชาที่ทุก section ชนกันหมด (ลงพร้อมกันไม่ได้แน่นอน)
 * - removableCourses: ถ้าตัดวิชานี้ออก จะหาชุดที่ลงตัวได้ (ใช้เมื่อไม่พบคู่ข้างบน)
 */
export function diagnose(options) {
  const emptyCourses = options.filter((o) => o.sections.length === 0).map((o) => o.course.code);
  const conflictingPairs = [];

  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const A = options[i];
      const B = options[j];
      if (A.sections.length === 0 || B.sections.length === 0) continue;
      const allConflict = A.sections.every((a) => B.sections.every((b) => sectionsConflict(a, b)));
      if (allConflict) conflictingPairs.push([A.course.code, B.course.code]);
    }
  }

  let removableCourses = [];
  if (emptyCourses.length === 0 && conflictingPairs.length === 0) {
    removableCourses = options
      .filter((o) => search(options.filter((x) => x !== o), 1).results.length > 0)
      .map((o) => o.course.code);
  }

  return { emptyCourses, conflictingPairs, removableCourses };
}

/**
 * หาชุด section ที่ไม่ชนกันทั้งหมด
 * @param courses ข้อมูลที่ผ่าน normalizeCourses แล้ว
 * @param opts.locks { [courseCode]: sectionId } — section ที่ผู้ใช้ล็อกไว้
 * @param opts.limit จำนวนผลลัพธ์สูงสุด
 * @returns { schedules, truncated, errors, diagnosis }
 *   schedules: Array<Array<{ course, section }>> เรียงตามลำดับวิชาที่ส่งเข้ามา
 *   truncated: true ถ้ามีชุดที่ลงตัวมากกว่า limit
 *   diagnosis: ไม่เป็น null เมื่อหาไม่ได้เลย
 */
export function generateSchedules(courses, { locks = {}, limit = DEFAULT_LIMIT } = {}) {
  if (courses.length === 0) {
    return { schedules: [], truncated: false, errors: ['ยังไม่มีวิชา'], diagnosis: null };
  }
  const { options, errors } = applyLocks(courses, locks);
  if (errors.length > 0) return { schedules: [], truncated: false, errors, diagnosis: null };

  const { results, truncated } = search(options, limit);
  const diagnosis = results.length === 0 ? diagnose(options) : null;
  return { schedules: results, truncated, errors: [], diagnosis };
}

/** ตัวชี้วัดของตารางหนึ่งชุด ใช้จัดอันดับและแสดงผล */
export function scheduleMetrics(schedule, { noBefore = null, noAfter = null } = {}) {
  const byDay = new Map();
  for (const { section } of schedule) {
    for (const s of section.sessions) {
      if (!byDay.has(s.day)) byDay.set(s.day, []);
      byDay.get(s.day).push(s);
    }
  }
  let totalGap = 0;
  let violations = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) totalGap += Math.max(0, list[i].start - list[i - 1].end);
    for (const s of list) {
      if (noBefore != null && s.start < noBefore) violations++;
      if (noAfter != null && s.end > noAfter) violations++;
    }
  }
  return { daysUsed: byDay.size, totalGap, violations };
}

/**
 * จัดอันดับตาราง (ไม่แก้ array เดิม) ลำดับความสำคัญ:
 *   1) จำนวนคาบที่ผิดเงื่อนไขเวลา (noBefore/noAfter) น้อยก่อน — ถ้าตั้งไว้
 *   2) จำนวนวันที่ต้องไปเรียนน้อยก่อน — ถ้า preferDaysOff
 *   3) ช่วงว่างระหว่างคาบรวมน้อยก่อน — ถ้า minimizeGaps
 *   4) ลำดับเดิม
 */
export function rankSchedules(schedules, prefs = {}) {
  const { preferDaysOff = false, minimizeGaps = false } = prefs;
  return schedules
    .map((schedule, i) => ({ schedule, metrics: scheduleMetrics(schedule, prefs), i }))
    .sort((a, b) => {
      const ma = a.metrics;
      const mb = b.metrics;
      if (ma.violations !== mb.violations) return ma.violations - mb.violations;
      if (preferDaysOff && ma.daysUsed !== mb.daysUsed) return ma.daysUsed - mb.daysUsed;
      if (minimizeGaps && ma.totalGap !== mb.totalGap) return ma.totalGap - mb.totalGap;
      return a.i - b.i;
    })
    .map(({ schedule, metrics }) => ({ schedule, metrics }));
}
