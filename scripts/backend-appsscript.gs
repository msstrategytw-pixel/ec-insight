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
const SITE_URL = 'https://msstrategytw-pixel.github.io/ec-insight/';
const TAB_NAMES = { ops: '🛠 電商經營', market: '📊 市場動態', external: '🌏 外站趨勢' };

const FEEDBACK_HEADERS = ['時間', '回饋者', '期別', '條目ID', '分類', '標題', '評價', '原因'];
const SAVE_HEADERS = ['時間', 'Email', '條目ID', '期別', '標題', '狀態'];
const SUB_HEADERS = ['時間', 'Email', '姓名', '訂閱狀態'];

// ---- 進入點 ----

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'feedback';

    // 所有動作都需要登入，回饋者身分一律取自登入憑證
    const user = verify(data.id_token);

    if (action === 'feedback') return json(handleFeedback(user, data));
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

/**
 * 首次部署（或程式新增了權限需求）後，在編輯器選這個函式按「執行」一次，
 * 依提示完成授權。授權後網頁應用程式才能驗證登入憑證、寄送電子報。
 */
function authorize() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  SpreadsheetApp.openById(SHEET_ID).getName();
  Logger.log('今日剩餘寄信額度：' + MailApp.getRemainingDailyQuota());
  Logger.log('授權完成');
}

// ---- 電子報 ----

/** 在試算表選單加入寄送入口，開啟試算表時自動執行。 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('電商情報站')
    .addItem('寄送最新一期電子報', 'sendLatestIssue')
    .addItem('預覽最新一期（只寄給我自己）', 'previewLatestIssue')
    .addItem('重寄最新一期（忽略已寄紀錄）', 'resendLatestIssue')
    .addToUi();
}

function sendLatestIssue() { sendIssue_(null, false, false); }
function resendLatestIssue() { sendIssue_(null, true, false); }
function previewLatestIssue() { sendIssue_(null, true, true); }

/**
 * @param {?string} date    指定期別；null 表示最新一期
 * @param {boolean} force   忽略「已寄過」紀錄
 * @param {boolean} preview 只寄給執行者本人，不動用訂閱名單、不記錄已寄
 */
function sendIssue_(date, force, preview) {
  const index = fetchJson_(SITE_URL + 'data/index.json');
  const target = date || index.issues[0].date;
  const props = PropertiesService.getScriptProperties();
  const sentKey = 'sent_' + target;

  if (!force && props.getProperty(sentKey)) {
    notify_('第 ' + target + ' 期已於 ' + props.getProperty(sentKey) + ' 寄送過。若要重寄請選「重寄最新一期」。');
    return;
  }

  const issue = fetchJson_(SITE_URL + 'data/' + target + '.json');
  const recipients = preview ? [Session.getActiveUser().getEmail()] : currentSubscribers();
  if (!recipients.length) {
    notify_('目前沒有訂閱者，未寄送。');
    return;
  }

  const subject = '電商情報站 第 ' + issue.issue + ' 期（' + issue.date + '）';
  const html = buildNewsletter_(issue);
  recipients.forEach(function (email) {
    MailApp.sendEmail({ to: email, subject: (preview ? '[預覽] ' : '') + subject, htmlBody: html, name: '電商情報站' });
  });

  if (!preview) props.setProperty(sentKey, new Date().toISOString());
  notify_('已寄出第 ' + issue.issue + ' 期給 ' + recipients.length + ' 位收件者。');
}

function buildNewsletter_(issue) {
  const published = issue.items.filter(function (i) { return i.published; });
  let html =
    '<div style="font-family:-apple-system,\'PingFang TC\',\'Microsoft JhengHei\',sans-serif;' +
    'max-width:640px;margin:0 auto;color:#2e2e2e;line-height:1.75;">' +
    '<h1 style="font-size:20px;font-weight:600;letter-spacing:-0.02em;margin:0 0 4px;">電商情報站　第 ' +
    issue.issue + ' 期</h1>' +
    '<p style="font-size:13px;color:rgba(0,0,0,.56);margin:0 0 28px;">' + issue.date +
    '　共 ' + published.length + ' 則</p>';

  ['ops', 'market', 'external'].forEach(function (tab) {
    const items = published.filter(function (i) { return i.tab === tab; });
    if (!items.length) return;
    html += '<h2 style="font-size:15px;font-weight:600;margin:32px 0 12px;">' + TAB_NAMES[tab] + '</h2>';
    items.forEach(function (item) {
      const score = item.score.breadth + item.score.action + item.score.timeliness;
      const tags = (item.tab === 'market' ? item.industries : []).concat(item.flags);
      html +=
        '<div style="background:#fff;border-radius:10px;padding:18px 20px;margin-bottom:14px;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.06);">' +
        '<div style="font-size:12px;color:rgba(0,0,0,.56);margin-bottom:6px;">評分 ' + score +
        (tags.length ? '　·　' + tags.join('　·　') : '') + '</div>' +
        '<div style="font-size:15px;font-weight:600;line-height:1.5;margin-bottom:8px;">' + item.title + '</div>' +
        '<div style="font-size:13.5px;color:rgba(0,0,0,.72);margin-bottom:10px;">' + item.summary + '</div>' +
        '<div style="font-size:13.5px;color:rgba(0,0,0,.72);background:#fafaf9;border-left:2px solid #207dff;' +
        'padding:10px 14px;margin-bottom:10px;"><strong style="color:#207dff;">對商家的意義</strong>　' +
        item.why_it_matters + '</div>' +
        '<div style="font-size:12px;color:rgba(0,0,0,.56);">來源：' +
        item.sources.map(function (s) {
          return '<a href="' + s.url + '" style="color:rgba(0,0,0,.56);">' + s.name + '</a>';
        }).join('・') + '</div></div>';
    });
  });

  if (issue.editor_note) {
    html +=
      '<div style="font-size:12.5px;color:rgba(0,0,0,.56);border-top:1px solid rgba(0,0,0,.07);' +
      'margin-top:28px;padding-top:16px;"><strong>本期編輯後記</strong><br>' + issue.editor_note + '</div>';
  }

  html +=
    '<p style="font-size:12px;color:rgba(0,0,0,.38);margin-top:28px;text-align:center;">' +
    '<a href="' + SITE_URL + '" style="color:#207dff;">在網站上瀏覽（可收藏與回饋）</a><br>' +
    '不想再收到？到網站登入後點「已訂閱電子報」即可取消。</p></div>';
  return html;
}

function fetchJson_(url) {
  return JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: false }).getContentText());
}

/** 從選單執行時跳提示；從編輯器執行時寫入 Log。 */
function notify_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

// ---- 動作 ----

function handleFeedback(user, data) {
  const sheet = ss().getSheets()[0];
  ensureHeaders(sheet, FEEDBACK_HEADERS);
  const who = user.name ? user.name + '（' + user.email + '）' : user.email;
  sheet.appendRow([
    new Date(), who, data.issue || '', data.item_id || '',
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
