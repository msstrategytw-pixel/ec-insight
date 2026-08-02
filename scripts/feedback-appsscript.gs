/**
 * ec-insight 回饋接收端點（Google Apps Script）
 *
 * 部署步驟（需要 Google 帳號，只做一次）：
 * 1. 開啟回饋用的 Google Sheet
 * 2. 選單「擴充功能 → Apps Script」
 * 3. 把本檔案內容整段貼上，取代預設的 myFunction
 * 4. 右上角「部署 → 新增部署作業」
 *    - 類型選「網頁應用程式」
 *    - 執行身分：我
 *    - 具有存取權的使用者：**所有人**（重要，否則網站送不進來）
 * 5. 部署後複製「網頁應用程式網址」，填進 docs/data/config.json 的 feedback_endpoint
 *
 * 修改本檔後必須「重新部署」才會生效（部署 → 管理部署作業 → 編輯 → 版本選「新版本」）。
 */

const SHEET_ID = '1ErsxKhXDYsfytsnTTt-nLkGJPAPjjwa-dWMkeC2HwhU';
const HEADERS = ['時間', '回饋者', '期別', '條目ID', '分類', '標題', '評價', '原因'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      data.user || '',
      data.issue || '',
      data.item_id || '',
      data.tab || '',
      data.title || '',
      data.verdict || '',
      data.note || '',
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 供健康檢查用：直接開網址應看到 {"ok":true,...}
function doGet() {
  return json({ ok: true, service: 'ec-insight feedback' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
