/**
 * الإحصائيات — الخادم المشترك (Google Sheets)
 * Eng. Ahmed Noori
 *
 * غيّر رمز المكتب أدناه إلى رمز خاص بكم، ثم انشر السكربت كتطبيق ويب.
 * نفس الرمز يُكتب في إعدادات التطبيق عند كل موظف.
 */
const OFFICE_KEY = 'khanaqin-2026';

const SHEET_NAME = 'البيانات';
const FIELDS = ['new_reg', 'reg_change', 'change', 'bio_change', 'correction', 'deletion', 'addition', 'cards_general', 'cards_special'];
const HEADERS = ['المعرف', 'التاريخ', 'الموظف',
  'تسجيل جديد', 'تسجيل + تغيير', 'تغيير', 'تغيير بايومتري', 'تصحيح', 'حذف', 'إضافة',
  'بطاقات موزعة - عام', 'بطاقات موزعة - خاص', 'ملاحظات', 'آخر تعديل'];
const COL_NOTES = 3 + FIELDS.length;      // 0-based index of notes
const COL_TIME = COL_NOTES + 1;

function doGet() {
  return json_({ ok: true, app: 'الإحصائيات' });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (String(req.key || '') !== OFFICE_KEY) throw new Error('رمز المكتب غير صحيح');
    out = handle_(req);
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return json_(out);
}

function handle_(req) {
  switch (req.action) {
    case 'ping': return { ok: true };
    case 'list': return { ok: true, rows: list_(req.from, req.to) };
    case 'save': return withLock_(() => save_(req.entry));
    case 'delete': return withLock_(() => del_(req.id));
    default: throw new Error('طلب غير معروف');
  }
}

/** شغّل هذه الدالة مرة واحدة من المحرر لمنح الأذونات وإنشاء جدول البيانات */
function setup() {
  const ss = book_();
  sheet_();
  Logger.log('جدول البيانات جاهز: ' + ss.getUrl());
}

function book_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) { }
  if (ss) return ss;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { } }
  ss = SpreadsheetApp.create('الإحصائيات - البيانات');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_() {
  const ss = book_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0B5D4B').setFontColor('#ffffff');
    sh.getRange('B:B').setNumberFormat('@');
    sh.setRightToLeft(true);
  }
  return sh;
}

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function rowToEntry_(r) {
  const o = { id: String(r[0]), date: dateStr_(r[1]), employee: String(r[2] || '') };
  FIELDS.forEach((f, i) => o[f] = Number(r[3 + i]) || 0);
  o.notes = String(r[COL_NOTES] || '');
  o.updated = r[COL_TIME] instanceof Date ? r[COL_TIME].toISOString() : String(r[COL_TIME] || '');
  return o;
}

function list_(from, to) {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const data = sh.getRange(2, 1, n, HEADERS.length).getValues();
  return data.filter(r => r[0] !== '').map(rowToEntry_)
    .filter(o => (!from || o.date >= from) && (!to || o.date <= to));
}

function findRow_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function save_(e) {
  if (!e || !e.id || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('بيانات غير مكتملة');
  const row = [String(e.id), e.date, String(e.employee || '')]
    .concat(FIELDS.map(f => Math.max(0, Math.floor(Number(e[f]) || 0))))
    .concat([String(e.notes || ''), new Date()]);
  const sh = sheet_();
  const at = findRow_(sh, e.id);
  if (at > 0) sh.getRange(at, 1, 1, row.length).setValues([row]);
  else {
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('@').setValue(e.date);
  }
  return { ok: true };
}

function del_(id) {
  const sh = sheet_();
  const at = findRow_(sh, id);
  if (at > 0) sh.deleteRow(at);
  return { ok: true };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
