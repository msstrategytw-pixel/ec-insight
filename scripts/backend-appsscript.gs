/**
 * ec-insight 後端（Google Apps Script）
 * 處理：回饋、收藏、電子報訂閱。收藏與訂閱需要 Google 登入。
 *
 * 部署步驟：
 * 1. 開回饋用的 Google Sheet → 選單「擴充功能 → Apps Script」
 * 2. 把本檔案整段貼上，覆蓋原有內容
 * 3. 填好下方兩個常數（SHEET_ID 已填、CLIENT_ID 需貼上 OAuth 用戶端 ID）
 * 4. 「部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選『新版本』→ 部署」
 *    ⚠ 用「管理部署作業」更新既有部署，網址才不會變；用「新增部署作業」會產生新網址。
 *
 * 資料表：第一個工作表存回饋（沿用既有），另自動建立「收藏」「訂閱」兩個工作表。
 * 皆為附加式（append-only）紀錄，讀取時取每人每項的最新狀態。
 */

const SHEET_ID = '1ErsxKhXDYsfytsnTTt-nLkGJPAPjjwa-dWMkeC2HwhU';
const CLIENT_ID = '247318398256-ekedifvb0icn0ge5v1gcnti4n6i597br.apps.googleusercontent.com';

const FEEDBACK_HEADERS = ['時間', '回饋者', '期別', '條目ID', '分類', '標題', '評價', '原因'];
const SAVE_HEADERS = ['時間', 'Email', '條目ID', '期別', '標題', '狀態'];
const SUB_HEADERS = ['時間', 'Email', '姓名', '訂閱狀態'];

// ---- 進入點 ----

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'feedback';

    if (action === 'feedback') return json(handleFeedback(data));

    // 其餘動作都需要登入
    const user = verify(data.id_token);
    if (action === 'sync') return json(handleSync(user, data.saved || []));
    if (action === 'save' || action === 'unsave') return json(handleSave(user, data, action));
    if (action === 'subscribe' || action === 'unsubscribe') return json(handleSub(user, action));

    return json({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'ec-insight backend' });
}

// ---- 動作 ----

function handleFeedback(data) {
  const sheet = ss().getSheets()[0];
  ensureHeaders(sheet, FEEDBACK_HEADERS);
  sheet.appendRow([
    new Date(), data.user || '', data.issue || '', data.item_id || '',
    data.tab || '', data.title || '', data.verdict || '', data.note || '',
  ]);
  return { ok: true };
}

function handleSave(user, data, action) {
  const sheet = tab('收藏', SAVE_HEADERS);
  sheet.appendRow([
    new Date(), user.email, data.item_id || '', data.issue || '',
    data.title || '', action === 'save' ? 'saved' : 'removed',
  ]);
  return { ok: true };
}

function handleSub(user, action) {
  const sheet = tab('訂閱', SUB_HEADERS);
  sheet.appendRow([
    new Date(), user.email, user.name || '',
    action === 'subscribe' ? 'subscribed' : 'unsubscribed',
  ]);
  return { ok: true, subscribed: action === 'subscribe' };
}

/** 登入時呼叫：把本機既有收藏合併上來，並回傳伺服器端的最新狀態。 */
function handleSync(user, localSaved) {
  const saved = savedSetOf(user.email);
  const sheet = tab('收藏', SAVE_HEADERS);
  localSaved.forEach(function (id) {
    if (!saved.has(id)) {
      sheet.appendRow([new Date(), user.email, id, '', '(本機合併)', 'saved']);
      saved.add(id);
    }
  });
  return { ok: true, email: user.email, saved: Array.from(saved), subscribed: isSubscribed(user.email) };
}

// ---- 查詢目前狀態（附加式紀錄取最新） ----

function savedSetOf(email) {
  const rows = tab('收藏', SAVE_HEADERS).getDataRange().getValues().slice(1);
  const latest = {};
  rows.forEach(function (r) {
    if (r[1] === email && r[2]) latest[r[2]] = r[5];
  });
  const out = new Set();
  Object.keys(latest).forEach(function (id) {
    if (latest[id] === 'saved') out.add(id);
  });
  return out;
}

function isSubscribed(email) {
  const rows = tab('訂閱', SUB_HEADERS).getDataRange().getValues().slice(1);
  let status = '';
  rows.forEach(function (r) {
    if (r[1] === email) status = r[3];
  });
  return status === 'subscribed';
}

/** 電子報寄送時使用：回傳目前訂閱者 email 陣列。 */
function currentSubscribers() {
  const rows = tab('訂閱', SUB_HEADERS).getDataRange().getValues().slice(1);
  const latest = {};
  rows.forEach(function (r) {
    if (r[1]) latest[r[1]] = r[3];
  });
  return Object.keys(latest).filter(function (e) {
    return latest[e] === 'subscribed';
  });
}

// ---- 驗證與工具 ----

/** 驗證 Google 登入憑證，確認是簽給本站的、且 email 已驗證。 */
function verify(idToken) {
  if (!idToken) throw new Error('需要登入');
  if (!CLIENT_ID) throw new Error('後端尚未設定 CLIENT_ID');
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) throw new Error('登入憑證無效或已過期');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CLIENT_ID) throw new Error('登入憑證不屬於本站');
  if (info.email_verified !== 'true' && info.email_verified !== true) throw new Error('Email 未驗證');
  return { email: info.email, name: info.name };
}

function ss() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function tab(name, headers) {
  let sheet = ss().getSheetByName(name);
  if (!sheet) sheet = ss().insertSheet(name);
  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
