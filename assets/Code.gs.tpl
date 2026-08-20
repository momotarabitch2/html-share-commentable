var HSC_CONFIG = __HSC_CONFIG_JSON__;
var HSC_PROPERTY_KEY = 'HSC_SPREADSHEET_' + HSC_CONFIG.reportId;
var HSC_SHEET_NAME = 'comments';
var HSC_HEADERS = [
  'comment_id', 'created_at', 'report_id', 'anchor_id', 'anchor_label',
  'anchor_path', 'quote_snapshot', 'location_url', 'author_email',
  'author_key', 'body', 'status', 'updated_at'
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(HSC_CONFIG.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupComments() {
  assertReviewer_();
  var url = getCommentSpreadsheet_(false).getUrl();
  console.log('Comment spreadsheet: ' + url);
  return url;
}

function getCommentState() {
  var reviewer = assertReviewer_();
  var spreadsheet = getCommentSpreadsheet_(false);
  var ownerEmail = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return {
    identity: reviewer.email,
    comments: readComments_(spreadsheet),
    spreadsheetUrl: reviewer.email === ownerEmail ? spreadsheet.getUrl() : ''
  };
}

function addComment(payload) {
  var reviewer = assertReviewer_();
  var input = payload || {};
  var anchorId = normalizeField_(input.anchorId, 'コメント位置', 100, true);
  var anchorLabel = normalizeField_(input.anchorLabel, 'コメント位置名', 200, true);
  var anchorPath = normalizeField_(input.anchorPath, 'コメント位置の階層', 500, false) || anchorLabel;
  var quoteSnapshot = normalizeField_(input.quoteSnapshot, '対象内容', 500, false);
  var body = normalizeField_(input.body, 'コメント', HSC_CONFIG.maxLength, true);
  var createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
  var commentId = Utilities.getUuid();
  var baseUrl = ScriptApp.getService().getUrl() || '';
  var locationUrl = baseUrl ? baseUrl + '?anchor=' + encodeURIComponent(anchorId) + '&comment=' + encodeURIComponent(commentId) : '';
  var lock = LockService.getScriptLock();

  lock.waitLock(10000);
  try {
    var sheet = ensureCommentSheet_(getCommentSpreadsheet_(true));
    sheet.appendRow([
      safeSheetText_(commentId), createdAt, safeSheetText_(HSC_CONFIG.reportId),
      safeSheetText_(anchorId), safeSheetText_(anchorLabel), safeSheetText_(anchorPath),
      safeSheetText_(quoteSnapshot), safeSheetText_(locationUrl), safeSheetText_(reviewer.email),
      safeSheetText_(reviewer.key), safeSheetText_(body), '未対応', createdAt
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    id: commentId, createdAt: createdAt, anchorId: anchorId, anchorLabel: anchorLabel,
    anchorPath: anchorPath, quoteSnapshot: quoteSnapshot, locationUrl: locationUrl,
    authorEmail: reviewer.email, body: body, status: '未対応'
  };
}

function assertReviewer_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Googleアカウントのメールアドレスを確認できないため、コメントを投稿できません。公開範囲と実行ユーザー設定を確認してください。');
  if (HSC_CONFIG.allowedDomains.length) {
    var domain = email.split('@').pop();
    if (HSC_CONFIG.allowedDomains.indexOf(domain) === -1) throw new Error('このGoogle Workspaceアカウントではコメントを投稿できません。');
  }
  return { email: email, key: Session.getTemporaryActiveUserKey() };
}

function getCommentSpreadsheet_(lockAlreadyHeld) {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty(HSC_PROPERTY_KEY);
  if (spreadsheetId) {
    try { return SpreadsheetApp.openById(spreadsheetId); }
    catch (error) { properties.deleteProperty(HSC_PROPERTY_KEY); }
  }
  var lock = null;
  if (!lockAlreadyHeld) {
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    spreadsheetId = properties.getProperty(HSC_PROPERTY_KEY);
    if (spreadsheetId) { lock.releaseLock(); return SpreadsheetApp.openById(spreadsheetId); }
  }
  try {
    var spreadsheet = SpreadsheetApp.create(HSC_CONFIG.spreadsheetName);
    properties.setProperty(HSC_PROPERTY_KEY, spreadsheet.getId());
    ensureCommentSheet_(spreadsheet);
    return spreadsheet;
  } finally { if (lock) lock.releaseLock(); }
}

function ensureCommentSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(HSC_SHEET_NAME);
  if (!sheet) {
    var sheets = spreadsheet.getSheets();
    sheet = sheets.length === 1 && sheets[0].getLastRow() === 0 ? sheets[0].setName(HSC_SHEET_NAME) : spreadsheet.insertSheet(HSC_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HSC_HEADERS.length).setValues([HSC_HEADERS]);
    sheet.getRange(1, 1, 1, HSC_HEADERS.length).setBackground('#24262b').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1); sheet.setColumnWidths(1, HSC_HEADERS.length, 150);
    sheet.setColumnWidth(6, 360); sheet.setColumnWidth(7, 420); sheet.setColumnWidth(8, 360); sheet.setColumnWidth(11, 520);
    sheet.getRange(1, 1, 1, HSC_HEADERS.length).createFilter();
  }
  return sheet;
}

function readComments_(spreadsheet) {
  var sheet = ensureCommentSheet_(spreadsheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var firstRow = Math.max(2, lastRow - 499);
  return sheet.getRange(firstRow, 1, lastRow - firstRow + 1, HSC_HEADERS.length).getDisplayValues().reverse().filter(function (row) {
    return row[0] && row[11] !== '削除';
  }).map(function (row) {
    return {
      id: stripSheetEscape_(row[0]), createdAt: row[1], anchorId: stripSheetEscape_(row[3]),
      anchorLabel: stripSheetEscape_(row[4]), anchorPath: stripSheetEscape_(row[5]),
      quoteSnapshot: stripSheetEscape_(row[6]), locationUrl: stripSheetEscape_(row[7]),
      authorEmail: stripSheetEscape_(row[8]), body: stripSheetEscape_(row[10]), status: row[11] || '未対応'
    };
  });
}

function normalizeField_(value, label, maxLength, required) {
  var text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (required && !text) throw new Error(label + 'を入力してください。');
  if (text.length > maxLength) throw new Error(label + 'は' + maxLength + '文字以内にしてください。');
  return text;
}

function safeSheetText_(value) {
  var text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function stripSheetEscape_(value) {
  var text = String(value || '');
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}
