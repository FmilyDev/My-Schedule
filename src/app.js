// หน้าเว็บ: แก้ไขวิชา/section, ตั้งค่าการเรียง, แสดงผลเป็นตารางรายสัปดาห์
import { DAYS, DAY_LABELS, parseTime, formatTime } from './time.js';
import { normalizeCourses, generateSchedules, rankSchedules, DEFAULT_LIMIT } from './scheduler.js';
import { emptyState, coerceState, loadState, saveState } from './storage.js';
import { SAMPLE } from './sample.js';

let state = loadState() ?? emptyState();
let resultIndex = 0;
let lastRanked = [];

const $ = (sel) => document.querySelector(sel);
const clone = (x) => JSON.parse(JSON.stringify(x));

// สร้าง element แบบปลอดภัย (ใช้ textContent เสมอ ข้อมูลจากไฟล์นำเข้าจึงฉีด HTML ไม่ได้)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function commit({ keepIndex = false } = {}) {
  if (!keepIndex) resultIndex = 0;
  if (!saveState(state)) showNotice('บันทึกในเบราว์เซอร์ไม่ได้ (อาจเป็นโหมดส่วนตัว) — ใช้งานต่อได้ แต่ปิดหน้าแล้วข้อมูลจะหาย');
  render();
}

let noticeTimer;
function showNotice(text) {
  const el = $('#notice');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (el.hidden = true), 6000);
}

const courseColor = (i) => {
  const hue = (i * 67 + 200) % 360;
  return { bg: `hsl(${hue} 70% 92%)`, border: `hsl(${hue} 55% 42%)`, text: `hsl(${hue} 60% 22%)` };
};

// ---------------- แผงแก้ไขวิชา ----------------

function setError(form, msg) {
  const el = form.querySelector('[data-error]');
  if (el) el.textContent = msg || '';
}

$('#form-course').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const code = form.code.value.trim();
  const name = form.name.value.trim();
  if (!code) return setError(form, 'ใส่รหัสวิชาก่อน');
  if (state.courses.some((c) => c.code === code)) return setError(form, `มีวิชา ${code} แล้ว`);
  state.courses.push({ code, name: name || code, sections: [] });
  form.reset();
  setError(form, '');
  commit();
  // โฟกัสช่องเพิ่ม section ของวิชาที่เพิ่งสร้าง
  document.querySelector(`[data-course="${CSS.escape(code)}"] input[name="secId"]`)?.focus();
});

function removeCourse(code) {
  state.courses = state.courses.filter((c) => c.code !== code);
  delete state.locks[code];
  commit();
}

function addSection(course, form) {
  const id = form.secId.value.trim();
  if (!id) return setError(form, 'ใส่หมายเลข section');
  if (course.sections.some((s) => s.id === id)) return setError(form, `มี sec ${id} แล้ว`);
  course.sections.push({ id, sessions: [] });
  commit();
}

function removeSection(course, id) {
  course.sections = course.sections.filter((s) => s.id !== id);
  if (state.locks[course.code] === id) delete state.locks[course.code];
  commit();
}

function addSession(section, form) {
  const { day, start, end, room } = form;
  if (!start.value || !end.value) return setError(form, 'ใส่เวลาเริ่มและเวลาจบ');
  if (parseTime(start.value) >= parseTime(end.value)) return setError(form, 'เวลาเริ่มต้องก่อนเวลาจบ');
  section.sessions.push({ day: day.value, start: start.value, end: end.value, room: room.value.trim() });
  commit();
}

function removeSession(section, i) {
  section.sessions.splice(i, 1);
  commit();
}

function nextSectionId(course) {
  const nums = course.sections.map((s) => Number(s.id)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

function renderCourses() {
  const list = $('#course-list');
  list.replaceChildren();
  if (state.courses.length === 0) {
    list.append(h('p', { class: 'empty' }, 'ยังไม่มีวิชา — เพิ่มด้านบน หรือกด "โหลดตัวอย่าง" เพื่อดูการทำงาน'));
    return;
  }
  state.courses.forEach((course, ci) => {
    const color = courseColor(ci);
    const locked = state.locks[course.code] ?? '';
    const lockSelect = h(
      'select',
      {
        'aria-label': `ล็อก section ของ ${course.code}`,
        onchange: (e) => {
          if (e.target.value) state.locks[course.code] = e.target.value;
          else delete state.locks[course.code];
          commit();
        },
      },
      h('option', { value: '' }, 'ให้โปรแกรมเลือก'),
      course.sections.map((s) => h('option', { value: s.id, selected: s.id === locked }, `ล็อก sec ${s.id}`)),
    );

    const sectionsEl = course.sections.map((section) => {
      const sessionForm = h(
        'form',
        { class: 'session-form', autocomplete: 'off', onsubmit: (e) => (e.preventDefault(), addSession(section, e.currentTarget)) },
        h('select', { name: 'day', 'aria-label': 'วัน' }, DAYS.map((d) => h('option', { value: d }, DAY_LABELS[d]))),
        h('input', { type: 'time', name: 'start', 'aria-label': 'เวลาเริ่ม', required: true }),
        h('span', { class: 'dash' }, '–'),
        h('input', { type: 'time', name: 'end', 'aria-label': 'เวลาจบ', required: true }),
        h('input', { name: 'room', placeholder: 'ห้อง', 'aria-label': 'ห้อง', class: 'room' }),
        h('button', { type: 'submit', class: 'small' }, '+ คาบ'),
        h('p', { class: 'form-error', 'data-error': true }),
      );
      return h(
        'div',
        { class: `section${locked === section.id ? ' is-locked' : ''}` },
        h(
          'div',
          { class: 'section-head' },
          h('strong', {}, `sec ${section.id}`),
          locked === section.id ? h('span', { class: 'tag' }, 'ล็อกไว้') : null,
          h('button', { type: 'button', class: 'icon', title: `ลบ sec ${section.id}`, 'aria-label': `ลบ sec ${section.id}`, onclick: () => removeSection(course, section.id) }, '✕'),
        ),
        section.sessions.length === 0
          ? h('p', { class: 'hint' }, 'ยังไม่มีคาบเรียน')
          : h(
              'ul',
              { class: 'sessions' },
              section.sessions.map((s, i) =>
                h(
                  'li',
                  {},
                  h('span', {}, `${DAY_LABELS[s.day] ?? s.day} ${s.start}–${s.end}`),
                  s.room ? h('span', { class: 'muted' }, ` · ${s.room}`) : null,
                  h('button', { type: 'button', class: 'icon', 'aria-label': 'ลบคาบนี้', onclick: () => removeSession(section, i) }, '✕'),
                ),
              ),
            ),
        h('details', { class: 'add-session', open: section.sessions.length === 0 }, h('summary', {}, '+ เพิ่มคาบ'), sessionForm),
      );
    });

    const sectionForm = h(
      'form',
      { class: 'row-form compact', autocomplete: 'off', onsubmit: (e) => (e.preventDefault(), addSection(course, e.currentTarget)) },
      h('input', { name: 'secId', value: nextSectionId(course), 'aria-label': 'หมายเลข section', class: 'sec-id' }),
      h('button', { type: 'submit', class: 'small' }, '+ section'),
      h('p', { class: 'form-error', 'data-error': true }),
    );

    list.append(
      h(
        'article',
        { class: 'course', 'data-course': course.code, style: `--c-border:${color.border};--c-bg:${color.bg}` },
        h(
          'header',
          { class: 'course-head' },
          h('div', {}, h('span', { class: 'code' }, course.code), ' ', h('span', { class: 'name' }, course.name !== course.code ? course.name : '')),
          h('div', { class: 'course-actions' }, lockSelect, h('button', { type: 'button', class: 'icon', title: `ลบวิชา ${course.code}`, 'aria-label': `ลบวิชา ${course.code}`, onclick: () => removeCourse(course.code) }, '✕')),
        ),
        sectionsEl,
        sectionForm,
      ),
    );
  });
}

// ---------------- การตั้งค่าการเรียง ----------------

function bindPrefs() {
  const map = [
    ['#pref-gaps', 'minimizeGaps', 'checked'],
    ['#pref-days', 'preferDaysOff', 'checked'],
    ['#pref-before', 'noBefore', 'value'],
    ['#pref-after', 'noAfter', 'value'],
  ];
  for (const [sel, key, prop] of map) {
    const el = $(sel);
    el.addEventListener('change', () => {
      state.prefs[key] = el[prop];
      commit();
    });
  }
}

function syncPrefs() {
  $('#pref-gaps').checked = !!state.prefs.minimizeGaps;
  $('#pref-days').checked = !!state.prefs.preferDaysOff;
  $('#pref-before').value = state.prefs.noBefore || '';
  $('#pref-after').value = state.prefs.noAfter || '';
}

function parsedPrefs() {
  const p = state.prefs;
  const safe = (t) => {
    try {
      return t ? parseTime(t) : null;
    } catch {
      return null;
    }
  };
  return { minimizeGaps: !!p.minimizeGaps, preferDaysOff: !!p.preferDaysOff, noBefore: safe(p.noBefore), noAfter: safe(p.noAfter) };
}

// ---------------- ผลลัพธ์ ----------------

function renderResults() {
  const area = $('#result-area');
  area.replaceChildren();
  lastRanked = [];

  if (state.courses.length === 0) {
    area.append(h('p', { class: 'empty' }, 'เพิ่มวิชาและ section ก่อน แล้วตารางจะขึ้นที่นี่'));
    return;
  }

  const { courses, errors } = normalizeCourses(state.courses);
  if (errors.length) {
    area.append(
      h('div', { class: 'callout warn' }, h('strong', {}, 'ข้อมูลยังไม่ครบหรือไม่ถูกต้อง'), h('ul', {}, errors.map((e) => h('li', {}, e)))),
    );
    return;
  }

  const prefs = parsedPrefs();
  const result = generateSchedules(courses, { locks: state.locks });
  if (result.errors.length) {
    area.append(h('div', { class: 'callout warn' }, h('ul', {}, result.errors.map((e) => h('li', {}, e)))));
    return;
  }

  if (result.schedules.length === 0) {
    area.append(renderDiagnosis(result.diagnosis));
    return;
  }

  const ranked = rankSchedules(result.schedules, prefs);
  lastRanked = ranked;
  resultIndex = Math.min(resultIndex, ranked.length - 1);
  const { schedule, metrics } = ranked[resultIndex];

  const countText = result.truncated
    ? `พบมากกว่า ${DEFAULT_LIMIT.toLocaleString()} ชุด (แสดง ${DEFAULT_LIMIT.toLocaleString()} ชุดแรกที่ค้นเจอ — ล็อก section เพิ่มเพื่อให้การเรียงครอบคลุมทุกชุด)`
    : `พบ ${ranked.length.toLocaleString()} ชุดที่เวลาไม่ชนกัน`;

  const gapH = Math.floor(metrics.totalGap / 60);
  const gapM = metrics.totalGap % 60;

  area.append(
    h('p', { class: result.truncated ? 'callout info' : 'count' }, countText),
    h(
      'div',
      { class: 'nav' },
      h('button', { type: 'button', class: 'ghost', disabled: resultIndex === 0, onclick: () => go(-1), 'aria-label': 'ชุดก่อนหน้า' }, '◀'),
      h('span', { class: 'nav-pos' }, `ชุดที่ ${resultIndex + 1} / ${ranked.length.toLocaleString()}`),
      h('button', { type: 'button', class: 'ghost', disabled: resultIndex === ranked.length - 1, onclick: () => go(1), 'aria-label': 'ชุดถัดไป' }, '▶'),
      h('button', { type: 'button', onclick: () => lockSchedule(schedule), title: 'ล็อกทุกวิชาตามชุดนี้' }, 'ล็อกชุดนี้'),
    ),
    h(
      'ul',
      { class: 'metrics' },
      h('li', {}, `ไปเรียน ${metrics.daysUsed} วัน`),
      h('li', {}, `ช่วงว่างรวม ${gapH ? `${gapH} ชม. ` : ''}${gapM} นาที`),
      prefs.noBefore != null || prefs.noAfter != null
        ? h('li', { class: metrics.violations ? 'bad' : 'good' }, metrics.violations ? `${metrics.violations} คาบอยู่นอกช่วงเวลาที่ต้องการ` : 'ทุกคาบอยู่ในช่วงเวลาที่ต้องการ')
        : null,
    ),
    renderGrid(schedule),
    renderPickList(schedule),
  );
}

function go(delta) {
  resultIndex = Math.max(0, Math.min(lastRanked.length - 1, resultIndex + delta));
  renderResults();
}

function lockSchedule(schedule) {
  for (const { course, section } of schedule) state.locks[course.code] = section.id;
  commit({ keepIndex: false });
  showNotice('ล็อกทุกวิชาตามชุดนี้แล้ว — เปลี่ยนได้ที่ช่อง "ล็อก" ของแต่ละวิชา');
}

function renderDiagnosis(d) {
  const items = [];
  for (const code of d.emptyCourses) items.push(`${code} ไม่มี section ให้เลือก`);
  for (const [a, b] of d.conflictingPairs) items.push(`${a} กับ ${b} ลงพร้อมกันไม่ได้ — ทุก section ของสองวิชานี้เวลาชนกัน${state.locks[a] || state.locks[b] ? ' (รวมถึง section ที่ล็อกไว้)' : ''}`);
  if (items.length === 0 && d.removableCourses.length) {
    items.push(`ไม่มีคู่วิชาไหนชนกันทั้งหมด แต่รวมกันแล้วไม่ลงตัว — ถ้าถอนวิชาใดวิชาหนึ่งต่อไปนี้จะจัดได้: ${d.removableCourses.join(', ')}`);
  }
  if (items.length === 0) items.push('ต้องถอนมากกว่าหนึ่งวิชาจึงจะจัดได้ ลองปลดล็อก section หรือถอนวิชาออกทีละวิชา');
  return h('div', { class: 'callout bad' }, h('strong', {}, 'ไม่มีชุดไหนที่เวลาไม่ชนกัน'), h('ul', {}, items.map((t) => h('li', {}, t))));
}

function renderGrid(schedule) {
  const colorIndex = new Map(state.courses.map((c, i) => [c.code, i]));
  const blocks = [];
  for (const { course, section } of schedule) {
    for (const s of section.sessions) blocks.push({ course, section, s });
  }
  const usedDays = new Set(blocks.map((b) => b.s.day));
  const days = DAYS.filter((d) => DAYS.indexOf(d) < 5 || usedDays.has(d));
  const startH = Math.floor(Math.min(...blocks.map((b) => b.s.start)) / 60);
  const endH = Math.ceil(Math.max(...blocks.map((b) => b.s.end)) / 60);
  const span = (endH - startH) * 60;
  const pct = (m) => `${((m - startH * 60) / span) * 100}%`;

  const hours = [];
  for (let hr = startH; hr <= endH; hr++) hours.push(hr);

  const timeCol = h(
    'div',
    { class: 'grid-times' },
    h('div', { class: 'grid-dayhead' }),
    h('div', { class: 'grid-body' }, hours.map((hr) => h('span', { class: 'hour-label', style: `top:${pct(hr * 60)}` }, formatTime(hr * 60)))),
  );

  const dayCols = days.map((d) =>
    h(
      'div',
      { class: 'grid-day' },
      h('div', { class: 'grid-dayhead' }, DAY_LABELS[d]),
      h(
        'div',
        { class: 'grid-body' },
        hours.map((hr) => h('span', { class: 'hour-line', style: `top:${pct(hr * 60)}` })),
        blocks
          .filter((b) => b.s.day === d)
          .map(({ course, section, s }) => {
            const c = courseColor(colorIndex.get(course.code) ?? 0);
            return h(
              'div',
              {
                class: 'block',
                style: `top:${pct(s.start)};height:${((s.end - s.start) / span) * 100}%;background:${c.bg};border-color:${c.border};color:${c.text}`,
                title: `${course.code} ${course.name} sec ${section.id}\n${formatTime(s.start)}–${formatTime(s.end)}${s.room ? ` ห้อง ${s.room}` : ''}`,
              },
              h('strong', {}, course.code),
              h('span', {}, `sec ${section.id}`),
              h('span', {}, `${formatTime(s.start)}–${formatTime(s.end)}`),
              s.room ? h('span', {}, s.room) : null,
            );
          }),
      ),
    ),
  );

  const grid = h('div', { class: 'grid', style: `--rows:${endH - startH}` }, timeCol, dayCols);
  return h('div', { class: 'grid-wrap' }, grid);
}

function renderPickList(schedule) {
  return h(
    'table',
    { class: 'picks' },
    h('thead', {}, h('tr', {}, h('th', {}, 'วิชา'), h('th', {}, 'section'), h('th', {}, 'เวลาเรียน'))),
    h(
      'tbody',
      {},
      schedule.map(({ course, section }) =>
        h(
          'tr',
          {},
          h('td', {}, h('strong', {}, course.code), course.name !== course.code ? ` ${course.name}` : ''),
          h('td', {}, section.id, state.locks[course.code] === section.id ? h('span', { class: 'tag' }, 'ล็อก') : null),
          h('td', {}, section.sessions.map((s) => h('div', {}, `${DAY_LABELS[s.day]} ${formatTime(s.start)}–${formatTime(s.end)}${s.room ? ` · ${s.room}` : ''}`))),
        ),
      ),
    ),
  );
}

// ---------------- แถบเครื่องมือ ----------------

$('#btn-sample').addEventListener('click', () => {
  if (state.courses.length && !confirmReplace()) return;
  state = clone(SAMPLE);
  syncPrefs();
  commit();
});

$('#btn-clear').addEventListener('click', () => {
  if (!state.courses.length) return;
  if (!confirmReplace('ลบข้อมูลทั้งหมด?')) return;
  state = emptyState();
  syncPrefs();
  commit();
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'schedule.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const next = coerceState(JSON.parse(await file.text()));
    if (state.courses.length && !confirmReplace()) return;
    state = next;
    syncPrefs();
    commit();
    showNotice(`นำเข้า ${state.courses.length} วิชาแล้ว`);
  } catch (err) {
    showNotice(`นำเข้าไม่สำเร็จ: ${err.message}`);
  }
});

// ใช้ confirm ของเบราว์เซอร์เฉพาะการกระทำที่ทับข้อมูลเดิม
function confirmReplace(msg = 'แทนที่ข้อมูลปัจจุบัน?') {
  return window.confirm(msg);
}

// ลูกศรซ้าย/ขวาเลื่อนดูชุดผลลัพธ์ (เมื่อไม่ได้พิมพ์อยู่)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft' && resultIndex > 0) go(-1);
  if (e.key === 'ArrowRight' && resultIndex < lastRanked.length - 1) go(1);
});

function render() {
  renderCourses();
  renderResults();
}

bindPrefs();
syncPrefs();
render();
