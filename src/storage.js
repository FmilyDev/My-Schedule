// บันทึก/โหลดข้อมูลใน localStorage ของเบราว์เซอร์ และแปลงไฟล์ JSON ที่นำเข้า

const KEY = 'create-schedule:v1';

export function emptyState() {
  return {
    courses: [],
    locks: {},
    prefs: { minimizeGaps: true, preferDaysOff: false, noBefore: '', noAfter: '' },
  };
}

/** รับ object จากไฟล์หรือ localStorage แล้วเติมส่วนที่ขาดให้ครบ (ไม่ตรวจความถูกต้องของวิชา — normalizeCourses ทำ) */
export function coerceState(data) {
  const base = emptyState();
  if (Array.isArray(data)) return { ...base, courses: data };
  if (!data || typeof data !== 'object' || !Array.isArray(data.courses)) {
    throw new Error('ไฟล์ไม่ถูกต้อง: ต้องมีรายการ "courses"');
  }
  return {
    courses: data.courses,
    locks: data.locks && typeof data.locks === 'object' ? data.locks : {},
    prefs: { ...base.prefs, ...(data.prefs && typeof data.prefs === 'object' ? data.prefs : {}) },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerceState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ใช้งานต่อได้แต่ไม่จำข้อมูล
  }
}
