'use strict';
/* الإحصائيات — Eng. Ahmed Noori */

const FIELDS = [
  { k: 'new_reg',       n: 'تسجيل جديد',       s: 'جديد',        g: 'reg',   c: '#0E7A62' },
  { k: 'reg_change',    n: 'تسجيل + تغيير',    s: 'تسجيل+تغيير', g: 'reg',   c: '#2563A8' },
  { k: 'change',        n: 'تغيير',            s: 'تغيير',       g: 'reg',   c: '#7A4FB5' },
  { k: 'bio_change',    n: 'تغيير بايومتري',   s: 'بايومتري',    g: 'reg',   c: '#B7791F' },
  { k: 'correction',    n: 'تصحيح',            s: 'تصحيح',       g: 'reg',   c: '#C2410C' },
  { k: 'deletion',      n: 'حذف',              s: 'حذف',         g: 'reg',   c: '#B42318' },
  { k: 'addition',      n: 'إضافة',            s: 'إضافة',       g: 'reg',   c: '#0F766E' },
  { k: 'cards_general', n: 'بطاقات موزعة - عام', s: 'بطاقات عام',  g: 'cards', c: '#475569' },
  { k: 'cards_special', n: 'بطاقات موزعة - خاص', s: 'بطاقات خاص',  g: 'cards', c: '#94A3B8' },
];
const REG = FIELDS.filter(f => f.g === 'reg');
const CARDS = FIELDS.filter(f => f.g === 'cards');
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bridge = window.AndroidBridge || null;

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};
let cfg = store.get('cfg', { url: '', key: '', name: '', office: '' });
let pending = store.get('pending', []);

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const fmt = s => s ? s.replace(/-/g, '/') : '';
const dayName = s => DAYS[parse(s).getDay()];
function periodRange(p) {
  const t = new Date(); const s = iso(t);
  const wStart = addDays(s, -t.getDay()); // الأسبوع يبدأ الأحد
  if (p === 'week') return [wStart, addDays(wStart, 6)];
  if (p === 'lastweek') return [addDays(wStart, -7), addDays(wStart, -1)];
  if (p === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
  if (p === 'lastmonth') return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))];
  return null;
}
function daysBetween(a, b) { const out = []; for (let d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }

/* ---------- ui helpers ---------- */
let toastT;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
function confirmDlg(msg) {
  return new Promise(res => {
    $('dlgMsg').textContent = msg; $('dlg').hidden = false;
    const done = v => { $('dlg').hidden = true; $('dlgOk').onclick = $('dlgNo').onclick = null; res(v); };
    $('dlgOk').onclick = () => done(true); $('dlgNo').onclick = () => done(false);
  });
}
const loadingHTML = '<div class="loading"><span class="spin"></span>جارِ التحميل…</div>';
const sumRow = (rows, keys = FIELDS) => { const o = {}; keys.forEach(f => o[f.k] = 0); rows.forEach(r => keys.forEach(f => o[f.k] += Number(r[f.k]) || 0)); return o; };
const regTotal = o => REG.reduce((a, f) => a + (Number(o[f.k]) || 0), 0);
const cardTotal = o => CARDS.reduce((a, f) => a + (Number(o[f.k]) || 0), 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- api + offline queue ---------- */
async function api(body) {
  if (!cfg.url) throw new Error('لم يتم ربط التطبيق بالخادم بعد — افتح الإعدادات');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: cfg.key }), signal: ctrl.signal, redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.error || 'خطأ في الخادم'); e.server = true; throw e; }
    return j;
  } catch (e) {
    if (e.server) throw e;
    const n = new Error('تعذر الاتصال بالإنترنت أو الخادم'); n.offline = true; throw n;
  } finally { clearTimeout(tm); }
}
function savePending() { store.set('pending', pending); renderPending(); }
function renderPending() { const b = $('pendingBadge'); b.hidden = !pending.length; b.textContent = `${pending.length} غير مرسل`; }
let flushing = false;
async function flush() {
  if (flushing || !pending.length || !cfg.url) return;
  flushing = true;
  try {
    while (pending.length) {
      await api(pending[0]);
      pending.shift(); savePending();
    }
  } catch (e) { if (!e.offline) toast(e.message); }
  finally { flushing = false; }
}
function queue(op) {
  if (op.action === 'save') pending = pending.filter(p => !(p.action === 'save' && p.entry.id === op.entry.id));
  if (op.action === 'delete') pending = pending.filter(p => !(p.action === 'save' && p.entry.id === op.id));
  pending.push(op); savePending();
}
function mergePending(rows, from, to) {
  let out = rows.slice();
  pending.forEach(p => {
    if (p.action === 'save') {
      out = out.filter(r => r.id !== p.entry.id);
      if ((!from || p.entry.date >= from) && (!to || p.entry.date <= to)) out.push({ ...p.entry, _pending: true });
    } else if (p.action === 'delete') out = out.filter(r => r.id !== p.id);
  });
  return out;
}
async function listRows(from, to) {
  const ck = 'cache:' + from + '|' + to;
  let rows, offline = false;
  try {
    await flush();
    rows = (await api({ action: 'list', from, to })).rows || [];
    store.set(ck, rows);
  } catch (e) {
    if (!e.offline) throw e;
    rows = store.get(ck, null); offline = true;
    if (!rows) rows = [];
  }
  return { rows: mergePending(rows, from, to), offline };
}

/* ---------- navigation ---------- */
let current = 'entry';
function show(v) {
  current = v;
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo(0, 0);
  if (v === 'entry') loadDayOffice();
  if (v === 'report') loadReport();
  if (v === 'year') loadYear();
  if (v === 'log') loadLog();
  if (v === 'settings') fillSettings();
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
$('btnSettings').onclick = () => show(current === 'settings' ? 'entry' : 'settings');
window.handleBack = () => { if (!$('dlg').hidden) { $('dlgNo').click(); return true; } if (current !== 'entry') { show('entry'); return true; } return false; };

/* ---------- entry ---------- */
let vals = {}; let editId = null;
function fieldHTML(f) {
  return `<div class="field"><div class="name"><span class="dot" style="background:${f.c}"></span>${f.n}</div>
  <div class="stepper"><button data-k="${f.k}" data-d="-1" aria-label="إنقاص">−</button>
  <input data-k="${f.k}" inputmode="numeric" pattern="[0-9]*" value="0" aria-label="${f.n}">
  <button data-k="${f.k}" data-d="1" aria-label="زيادة">+</button></div></div>`;
}
$('fieldsReg').innerHTML = REG.map(fieldHTML).join('');
$('fieldsCards').innerHTML = CARDS.map(fieldHTML).join('');
function setVal(k, v) {
  v = Math.max(0, Math.min(9999, parseInt(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''), 10) || 0));
  vals[k] = v;
  const inp = document.querySelector(`#v-entry input[data-k="${k}"]`);
  if (inp && String(inp.value) !== String(v)) inp.value = v;
  inp && inp.classList.toggle('nz', v > 0);
  $('eTotal').textContent = regTotal(vals);
  $('eCards').textContent = cardTotal(vals) ? `+ ${cardTotal(vals)} بطاقة موزعة` : '';
}
function resetForm() { FIELDS.forEach(f => setVal(f.k, 0)); $('eNotes').value = ''; editId = null; $('editBanner').hidden = true; $('btnSave').textContent = 'حفظ'; }
document.querySelectorAll('#v-entry .stepper button').forEach(b => b.onclick = () => setVal(b.dataset.k, (vals[b.dataset.k] || 0) + Number(b.dataset.d)));
document.querySelectorAll('#v-entry .stepper input').forEach(i => {
  i.onfocus = () => i.select();
  i.oninput = () => setVal(i.dataset.k, i.value);
  i.onblur = () => setVal(i.dataset.k, i.value);
});
function setDate(s) { $('eDate').value = s; $('eDayName').textContent = dayName(s) + (s === today() ? ' — اليوم' : ''); loadDayOffice(); }
$('eDate').onchange = () => $('eDate').value && setDate($('eDate').value);
document.querySelectorAll('#v-entry .nav-day').forEach(b => b.onclick = () => setDate(addDays($('eDate').value || today(), Number(b.dataset.d))));
$('btnCancelEdit').onclick = resetForm;

$('btnSave').onclick = async () => {
  if (!cfg.name) { toast('اكتب اسمك في الإعدادات أولاً'); show('settings'); return; }
  FIELDS.forEach(f => setVal(f.k, document.querySelector(`#v-entry input[data-k="${f.k}"]`).value));
  const total = regTotal(vals) + cardTotal(vals);
  if (!total && !$('eNotes').value.trim()) { toast('لم تُدخل أي رقم'); return; }
  const date = $('eDate').value || today();
  if (date > today() && !(await confirmDlg('التاريخ في المستقبل، هل أنت متأكد؟'))) return;
  const entry = { id: editId || uid(), date, employee: cfg.name, notes: $('eNotes').value.trim() };
  FIELDS.forEach(f => entry[f.k] = vals[f.k] || 0);
  const wasEdit = !!editId;
  queue({ action: 'save', entry });
  resetForm();
  $('btnSave').disabled = true;
  await flush();
  $('btnSave').disabled = false;
  toast(pending.some(p => p.entry && p.entry.id === entry.id) ? 'حُفظ على الجهاز وسيُرسل عند توفر الإنترنت' : (wasEdit ? 'تم تعديل الإدخال ✓' : 'تم الحفظ ✓'));
  loadDayOffice();
};

async function loadDayOffice() {
  const d = $('eDate').value || today();
  const box = $('dayOffice');
  if (!cfg.url) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">اربط التطبيق من الإعدادات لعرض مجموع المكتب</div>'; return; }
  box.innerHTML = '<div class="loading" style="grid-column:1/-1"><span class="spin"></span></div>';
  try {
    const { rows, offline } = await listRows(d, d);
    if ($('eDate').value !== d) return;
    const s = sumRow(rows);
    const emps = new Set(rows.map(r => r.employee)).size;
    const items = [`<div class="mini" style="background:var(--brand-soft)"><b style="color:var(--brand)">${regTotal(s)}</b><span>مجموع الحالات</span></div>`]
      .concat(FIELDS.filter(f => s[f.k]).map(f => `<div class="mini"><b style="color:${f.c}">${s[f.k]}</b><span>${f.s}</span></div>`));
    box.innerHTML = items.join('') + `<div class="empty" style="grid-column:1/-1;padding:4px">${rows.length ? `${rows.length} إدخال من ${emps} موظف` : 'لا توجد إدخالات لهذا اليوم'}${offline ? ' — (بدون إنترنت)' : ''}</div>`;
  } catch (e) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
}
$('btnRefreshDay').onclick = loadDayOffice;

function editEntry(r) {
  show('entry');
  editId = r.id; setDate(r.date);
  FIELDS.forEach(f => setVal(f.k, r[f.k] || 0));
  $('eNotes').value = r.notes || '';
  $('editBanner').hidden = false; $('editBanner').querySelector('span').textContent = `تعديل إدخال ${r.employee} — ${fmt(r.date)}`;
  $('btnSave').textContent = 'حفظ التعديل';
}

/* ---------- report ---------- */
let period = 'week';
function setRange(p) {
  period = p;
  document.querySelectorAll('#periodChips button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  const r = periodRange(p);
  if (r) { $('rFrom').value = r[0]; $('rTo').value = r[1]; }
}
document.querySelectorAll('#periodChips button').forEach(b => b.onclick = () => { setRange(b.dataset.p); if (b.dataset.p !== 'custom') loadReport(); else $('rFrom').focus(); });
$('rFrom').onchange = $('rTo').onchange = () => { setRange('custom'); loadReport(); };

let lastReport = null;
function aggregate(rows, from, to) {
  const tot = sumRow(rows);
  const byDay = {}; rows.forEach(r => (byDay[r.date] = byDay[r.date] || []).push(r));
  const span = daysBetween(from, to);
  const dates = span.length <= 62 ? span : Object.keys(byDay).sort();
  const days = dates.map(d => ({ date: d, ...sumRow(byDay[d] || []) }));
  const byEmp = {}; rows.forEach(r => (byEmp[r.employee || '—'] = byEmp[r.employee || '—'] || []).push(r));
  const emps = Object.keys(byEmp).map(n => ({ name: n, count: byEmp[n].length, ...sumRow(byEmp[n]) })).sort((a, b) => regTotal(b) - regTotal(a));
  const workDays = Object.keys(byDay).length;
  return { from, to, rows, tot, days, emps, workDays };
}
function barChart(items, labelFn, h = 150) {
  const W = 600, pad = 22, max = Math.max(1, ...items.map(i => i.v));
  const bw = (W - 10) / Math.max(items.length, 1);
  const bars = items.map((it, i) => {
    const bh = Math.round((it.v / max) * (h - pad - 18));
    const x = W - (i + 1) * bw + bw * 0.15, y = h - pad - bh;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(bh, it.v ? 2 : 0)}" rx="3" fill="var(--brand-2)"/>` +
      (it.v ? `<text x="${(x + bw * 0.35).toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="${items.length > 20 ? 9 : 12}" font-weight="700" fill="var(--ink)">${it.v}</text>` : '') +
      ((items.length <= 16 || i % Math.ceil(items.length / 12) === 0) ? `<text x="${(x + bw * 0.35).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="${items.length > 20 ? 9 : 11}" fill="var(--muted)">${esc(labelFn(it))}</text>` : '');
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img"><line x1="0" x2="${W}" y1="${h - pad}" y2="${h - pad}" stroke="var(--line)"/>${bars}</svg>`;
}
function catListHTML(tot) {
  const max = Math.max(1, ...REG.map(f => tot[f.k]));
  return REG.map(f => `<div class="cat"><div class="name"><span class="dot" style="background:${f.c}"></span>${f.n}</div><div class="val">${tot[f.k]}</div><div class="bar"><i style="width:${(tot[f.k] / max * 100).toFixed(1)}%;background:${f.c}"></i></div></div>`).join('');
}
function dayTableHTML(days) {
  const head = `<tr><th>التاريخ</th>${FIELDS.map(f => `<th>${f.s}</th>`).join('')}<th>المجموع</th></tr>`;
  const body = days.map(d => `<tr><td>${fmt(d.date).slice(5)} <span style="color:var(--muted);font-size:11px">${dayName(d.date)}</span></td>${FIELDS.map(f => `<td class="${d[f.k] ? '' : 'z'}">${d[f.k]}</td>`).join('')}<td><b>${regTotal(d)}</b></td></tr>`).join('');
  const t = sumRow(days);
  return `<div class="table-wrap"><table>${head}${body}<tr class="total"><td>المجموع</td>${FIELDS.map(f => `<td>${t[f.k]}</td>`).join('')}<td>${regTotal(t)}</td></tr></table></div>`;
}
async function loadReport() {
  if (!$('rFrom').value) setRange(period);
  let from = $('rFrom').value, to = $('rTo').value;
  if (from > to) [from, to] = [to, from];
  const body = $('reportBody');
  body.innerHTML = loadingHTML;
  try {
    const { rows, offline } = await listRows(from, to);
    const a = lastReport = aggregate(rows, from, to);
    const t = a.tot;
    body.innerHTML = `
      <div class="period-title">من ${dayName(from)} ${fmt(from)} إلى ${dayName(to)} ${fmt(to)}${offline ? ' — نسخة محفوظة (بدون إنترنت)' : ''}</div>
      <div class="kpis">
        <div class="kpi"><span>مجموع الحالات الكلي</span><b>${regTotal(t)}</b><small>${a.workDays} يوم عمل · ${rows.length} إدخال</small></div>
        <div class="kpi alt"><span>البطاقات الموزعة</span><b>${cardTotal(t)}</b><small>عام ${t.cards_general} · خاص ${t.cards_special}</small></div>
      </div>
      <div class="actions-row">
        <button class="ghost" id="rShareTxt">إرسال الموقف</button>
        <button class="ghost" id="rXls">تنزيل Excel</button>
        <button class="ghost" id="rXlsShare">إرسال Excel</button>
      </div>
      <div class="card"><h2 class="sec m0">كل حالة على حدة</h2><div class="cat-list">${catListHTML(t)}</div></div>
      ${a.days.length > 1 ? `<div class="card"><h2 class="sec m0">الحالات حسب اليوم</h2>${barChart(a.days.map(d => ({ v: regTotal(d), date: d.date })), it => it.date.slice(8))}</div>` : ''}
      <div class="card"><h2 class="sec m0">الموقف اليومي</h2>${a.days.length ? dayTableHTML(a.days) : '<div class="empty">لا توجد بيانات</div>'}</div>
      ${a.emps.length ? `<div class="card"><h2 class="sec m0">حسب الموظف</h2><div class="table-wrap"><table><tr><th>الموظف</th><th>الإدخالات</th><th>الحالات</th><th>البطاقات</th></tr>${a.emps.map(e => `<tr><td>${esc(e.name)}</td><td>${e.count}</td><td><b>${regTotal(e)}</b></td><td>${cardTotal(e)}</td></tr>`).join('')}</table></div></div>` : ''}`;
    $('rShareTxt').onclick = () => shareText(reportText(a));
    $('rXls').onclick = () => exportExcel(a, false);
    $('rXlsShare').onclick = () => exportExcel(a, true);
  } catch (e) { body.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
function reportText(a) {
  const t = a.tot;
  return [
    'موقف تحديث سجل الناخبين',
    cfg.office || '',
    `للفترة من ${fmt(a.from)} إلى ${fmt(a.to)}`,
    '',
    ...REG.map(f => `${f.n}: ${t[f.k]}`),
    `— مجموع الحالات الكلي: ${regTotal(t)}`,
    '',
    `البطاقات الموزعة: عام ${t.cards_general} / خاص ${t.cards_special} (المجموع ${cardTotal(t)})`,
  ].filter((l, i) => l !== '' || i > 2).join('\n');
}

/* ---------- excel ---------- */
function buildWorkbook(a, title) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const t = a.tot;
  const summary = [
    [title], [cfg.office || ''], [`للفترة من ${fmt(a.from)} إلى ${fmt(a.to)}`], [],
    ['الحالة', 'العدد'],
    ...REG.map(f => [f.n, t[f.k]]),
    ['مجموع الحالات الكلي', regTotal(t)], [],
    ...CARDS.map(f => [f.n, t[f.k]]),
    ['مجموع البطاقات', cardTotal(t)], [],
    ['عدد أيام العمل', a.workDays], ['عدد الإدخالات', a.rows.length],
  ];
  const s1 = XLSX.utils.aoa_to_sheet(summary); s1['!cols'] = [{ wch: 26 }, { wch: 12 }];
  s1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, s1, 'الموقف');

  const dHead = [a.dayLabel || 'التاريخ', ...(a.dayLabel ? [] : ['اليوم']), ...FIELDS.map(f => f.n), 'مجموع الحالات', 'مجموع البطاقات'];
  const dRows = a.days.map(d => [d.label || fmt(d.date), ...(a.dayLabel ? [] : [dayName(d.date)]), ...FIELDS.map(f => d[f.k]), regTotal(d), cardTotal(d)]);
  const dt = sumRow(a.days);
  dRows.push(['المجموع', ...(a.dayLabel ? [] : ['']), ...FIELDS.map(f => dt[f.k]), regTotal(dt), cardTotal(dt)]);
  const s2 = XLSX.utils.aoa_to_sheet([dHead, ...dRows]); s2['!cols'] = dHead.map((h, i) => ({ wch: i === 0 ? 14 : Math.max(9, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, s2, a.dayLabel ? 'شهري' : 'يومي');

  const eHead = ['الموظف', 'عدد الإدخالات', ...FIELDS.map(f => f.n), 'مجموع الحالات', 'مجموع البطاقات'];
  const s3 = XLSX.utils.aoa_to_sheet([eHead, ...a.emps.map(e => [e.name, e.count, ...FIELDS.map(f => e[f.k]), regTotal(e), cardTotal(e)])]);
  s3['!cols'] = eHead.map((h, i) => ({ wch: i === 0 ? 18 : Math.max(9, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, s3, 'حسب الموظف');

  const rHead = ['التاريخ', 'اليوم', 'الموظف', ...FIELDS.map(f => f.n), 'ملاحظات'];
  const rr = a.rows.slice().sort((x, y) => x.date.localeCompare(y.date)).map(r => [fmt(r.date), dayName(r.date), r.employee, ...FIELDS.map(f => Number(r[f.k]) || 0), r.notes || '']);
  const s4 = XLSX.utils.aoa_to_sheet([rHead, ...rr]); s4['!cols'] = rHead.map((h, i) => ({ wch: i < 3 ? 14 : Math.max(9, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, s4, 'التفاصيل');
  return wb;
}
function exportExcel(a, share, title = 'موقف تحديث سجل الناخبين', name) {
  try {
    const wb = buildWorkbook(a, title);
    const fname = (name || `موقف ${a.from} الى ${a.to}`) + '.xlsx';
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    if (bridge) {
      const res = share ? bridge.shareFile(fname, b64, mime) : bridge.saveFile(fname, b64, mime);
      if (res && res !== 'ok') toast(res); else if (!share) toast('حُفظ في التنزيلات ← الإحصائيات');
    } else {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      // iPhone / web: share sheet (WhatsApp, Files, Telegram...) when available
      const file = typeof File === 'function' ? new File([u8], fname, { type: mime }) : null;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if ((share || isIOS) && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: fname }).catch(e => { if (e && e.name !== 'AbortError') toast('تعذر الإرسال: ' + e.message); });
        return;
      }
      const url = URL.createObjectURL(new Blob([u8], { type: mime }));
      const l = document.createElement('a'); l.href = url; l.download = fname; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  } catch (e) { toast('تعذر إنشاء ملف Excel: ' + e.message); }
}
function shareText(text) {
  if (bridge) bridge.shareText(text);
  else if (navigator.share) navigator.share({ text }).catch(() => { });
  else navigator.clipboard.writeText(text).then(() => toast('تم نسخ النص'));
}

/* ---------- year / monthly ---------- */
let year = new Date().getFullYear();
$('yPrev').onclick = () => { year--; loadYear(); };
$('yNext').onclick = () => { year++; loadYear(); };
async function loadYear() {
  $('yTitle').textContent = 'سنة ' + year;
  const body = $('yearBody'); body.innerHTML = loadingHTML;
  const from = `${year}-01-01`, to = `${year}-12-31`;
  try {
    const { rows, offline } = await listRows(from, to);
    const months = MONTHS.map((m, i) => {
      const key = `${year}-${pad(i + 1)}`;
      const rs = rows.filter(r => r.date.startsWith(key));
      return { label: m, key, i, n: rs.length, ...sumRow(rs) };
    });
    const t = sumRow(rows);
    const curM = new Date().getFullYear() === year ? new Date().getMonth() : 11;
    const shown = months.filter(m => m.i <= curM || m.n);
    const a = { from, to, rows, tot: t, days: shown, dayLabel: 'الشهر', emps: aggregate(rows, from, to).emps, workDays: new Set(rows.map(r => r.date)).size };
    body.innerHTML = `
      ${offline ? '<div class="period-title">نسخة محفوظة (بدون إنترنت)</div>' : ''}
      <div class="kpis">
        <div class="kpi"><span>مجموع حالات السنة</span><b>${regTotal(t)}</b><small>${a.workDays} يوم عمل</small></div>
        <div class="kpi alt"><span>بطاقات السنة</span><b>${cardTotal(t)}</b><small>عام ${t.cards_general} · خاص ${t.cards_special}</small></div>
      </div>
      <div class="actions-row"><button class="ghost" id="yXls">تنزيل Excel</button><button class="ghost" id="yXlsShare">إرسال Excel</button></div>
      <div class="card"><h2 class="sec m0">الحالات حسب الشهر</h2>${barChart(months.map(m => ({ v: regTotal(m), i: m.i })), it => String(it.i + 1))}</div>
      <div class="card"><h2 class="sec m0">موقف الأشهر <span style="font-weight:400;color:var(--muted);font-size:12px">— اضغط على الشهر لتفاصيله</span></h2>
      <div class="table-wrap"><table><tr><th>الشهر</th>${FIELDS.map(f => `<th>${f.s}</th>`).join('')}<th>المجموع</th></tr>
      ${shown.map(m => `<tr class="clickable" data-m="${m.i}"><td>${m.label}</td>${FIELDS.map(f => `<td class="${m[f.k] ? '' : 'z'}">${m[f.k]}</td>`).join('')}<td><b>${regTotal(m)}</b></td></tr>`).join('')}
      <tr class="total"><td>المجموع</td>${FIELDS.map(f => `<td>${t[f.k]}</td>`).join('')}<td>${regTotal(t)}</td></tr></table></div></div>`;
    body.querySelectorAll('tr[data-m]').forEach(tr => tr.onclick = () => {
      const i = Number(tr.dataset.m);
      show('report'); setRange('custom');
      $('rFrom').value = iso(new Date(year, i, 1)); $('rTo').value = iso(new Date(year, i + 1, 0));
      loadReport();
    });
    $('yXls').onclick = () => exportExcel(a, false, `الموقف السنوي ${year}`, `موقف سنة ${year}`);
    $('yXlsShare').onclick = () => exportExcel(a, true, `الموقف السنوي ${year}`, `موقف سنة ${year}`);
  } catch (e) { body.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

/* ---------- log ---------- */
$('lFrom').onchange = $('lTo').onchange = $('lMine').onchange = () => loadLog();
async function loadLog() {
  if (!$('lFrom').value) { $('lTo').value = today(); $('lFrom').value = addDays(today(), -13); }
  const from = $('lFrom').value, to = $('lTo').value;
  const body = $('logBody'); body.innerHTML = loadingHTML;
  try {
    let { rows, offline } = await listRows(from, to);
    if ($('lMine').checked) rows = rows.filter(r => r.employee === cfg.name);
    rows.sort((a, b) => b.date.localeCompare(a.date) || String(b.updated || '').localeCompare(String(a.updated || '')));
    if (!rows.length) { body.innerHTML = `<div class="card empty">لا توجد إدخالات في هذه الفترة${offline ? ' (بدون إنترنت)' : ''}</div>`; return; }
    let html = offline ? '<div class="period-title">نسخة محفوظة (بدون إنترنت)</div>' : '', last = '';
    const byId = {};
    rows.forEach(r => {
      byId[r.id] = r;
      if (r.date !== last) {
        last = r.date;
        const ds = sumRow(rows.filter(x => x.date === r.date));
        html += `<div class="day-group"><span>${dayName(r.date)} ${fmt(r.date)}</span><span>${regTotal(ds)} حالة</span></div>`;
      }
      const tags = FIELDS.filter(f => r[f.k]).map(f => `<span class="tag">${f.n} <b>${r[f.k]}</b></span>`).join('') || '<span class="tag">بدون أرقام</span>';
      html += `<div class="entry"><div class="head"><div><div class="date">${esc(r.employee)}</div><div class="emp">${r._pending ? 'بانتظار الإرسال' : 'المجموع ' + regTotal(r)}</div></div>
        <div class="acts"><button class="link" data-edit="${esc(r.id)}">تعديل</button><button class="link danger" data-del="${esc(r.id)}">حذف</button></div></div>
        <div class="tags">${tags}</div>${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}</div>`;
    });
    body.innerHTML = html;
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEntry(byId[b.dataset.edit]));
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = byId[b.dataset.del];
      if (!(await confirmDlg(`حذف إدخال ${r.employee} بتاريخ ${fmt(r.date)}؟`))) return;
      queue({ action: 'delete', id: r.id }); await flush(); toast('تم الحذف'); loadLog();
    });
  } catch (e) { body.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

/* ---------- settings ---------- */
function fillSettings() { $('sName').value = cfg.name; $('sOffice').value = cfg.office; $('sUrl').value = cfg.url; $('sKey').value = cfg.key; }
function readSettings() {
  cfg = { name: $('sName').value.trim(), office: $('sOffice').value.trim(), url: $('sUrl').value.trim(), key: $('sKey').value.trim() };
  store.set('cfg', cfg); applyHeader();
}
function applyHeader() { $('hdrSub').textContent = cfg.office || 'تحديث سجل الناخبين'; $('eWho').textContent = cfg.name || 'بدون اسم'; }
function status(msg, ok) { const s = $('sStatus'); s.textContent = msg; s.className = 'status ' + (ok ? 'ok' : 'err'); }
$('btnSaveSettings').onclick = async () => {
  readSettings();
  if (!cfg.name) return status('اكتب اسم الموظف', false);
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.url)) return status('الرابط يجب أن يبدأ بـ https://script.google.com', false);
  status('تم الحفظ، جارِ اختبار الاتصال…', true);
  testConn();
};
async function testConn() {
  try { await api({ action: 'ping' }); status('الاتصال ناجح ✓ البيانات مشتركة مع المكتب', true); flush(); }
  catch (e) { status(e.message, false); }
}
$('btnTest').onclick = () => { readSettings(); testConn(); };
$('btnShareCfg').onclick = () => {
  readSettings();
  if (!cfg.url) return status('احفظ الرابط أولاً', false);
  const code = 'KH2:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.url, k: cfg.key, o: cfg.office }))));
  shareText(`رمز إعداد تطبيق الإحصائيات:\n${code}\n\nافتح التطبيق ← الإعدادات ← لصق رمز إعداد`);
};
$('btnPasteCfg').onclick = () => { $('cfgCode').hidden = false; $('btnApplyCfg').hidden = false; $('cfgCode').focus(); };
$('btnApplyCfg').onclick = () => {
  const m = $('cfgCode').value.match(/KH2:([A-Za-z0-9+/=]+)/);
  if (!m) return status('رمز الإعداد غير صحيح', false);
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    $('sUrl').value = o.u || ''; $('sKey').value = o.k || ''; if (o.o) $('sOffice').value = o.o;
    $('cfgCode').value = ''; $('cfgCode').hidden = true; $('btnApplyCfg').hidden = true;
    readSettings();
    if (!cfg.name) { status('تم تطبيق الرمز ✓ اكتب اسمك ثم اضغط حفظ', true); $('sName').focus(); }
    else testConn();
  } catch { status('رمز الإعداد غير صحيح', false); }
};

/* ---------- start ---------- */
applyHeader(); renderPending(); resetForm(); setRange('week');
$('eDate').value = today(); $('eDayName').textContent = dayName(today()) + ' — اليوم';
if (!cfg.url || !cfg.name) { show('settings'); status('أهلاً بك — اكتب اسمك واربط التطبيق بالخادم المشترك للبدء', true); }
else show('entry');
window.addEventListener('online', flush);
setInterval(flush, 60000);
