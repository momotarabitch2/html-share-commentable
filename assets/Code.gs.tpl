var HSC_CONFIG = __HSC_CONFIG_JSON__;
var HSC_PROPERTY_KEY = 'HSC_SPREADSHEET_' + HSC_CONFIG.reportId;
var HSC_OWNER_PROPERTY_KEY = 'HSC_OWNER_EMAIL_' + HSC_CONFIG.reportId;
var HSC_COMMENT_SHEET_NAME = 'comments';
var HSC_REVIEWER_SHEET_NAME = 'reviewers';
var HSC_COMMENT_HEADERS = [
  'comment_id', 'created_at', 'report_id', 'anchor_id', 'anchor_label',
  'anchor_path', 'quote_snapshot', 'location_url', 'author_email',
  'author_key', 'author_display_name', 'body', 'status', 'updated_at'
];
var HSC_REVIEWER_HEADERS = ['author_email', 'display_name', 'created_at', 'updated_at'];
var HSC_RATE_LIMIT_MAX = 10;
var HSC_RATE_LIMIT_SECONDS = 60;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(HSC_CONFIG.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupComments() {
  var reviewer = assertReviewer_();
  var properties = PropertiesService.getScriptProperties();
  var storedOwnerEmail = String(properties.getProperty(HSC_OWNER_PROPERTY_KEY) || '').trim().toLowerCase();
  if (!storedOwnerEmail) {
    var effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    if (!effectiveEmail || reviewer.email !== effectiveEmail) throw new Error('管理者アカウントでセットアップを実行してください。');
    properties.setProperty(HSC_OWNER_PROPERTY_KEY, reviewer.email);
    storedOwnerEmail = reviewer.email;
  }
  if (reviewer.email !== storedOwnerEmail) throw new Error('管理者アカウントでセットアップを実行してください。');
  var spreadsheet = getCommentSpreadsheet_(false);
  ensureCommentSheet_(spreadsheet);
  ensureReviewerSheet_(spreadsheet);
  var url = spreadsheet.getUrl();
  console.log('Comment spreadsheet: ' + url);
  return url;
}

function getCommentState() {
  var reviewer = assertReviewer_();
  var spreadsheet = getCommentSpreadsheet_(false);
  ensureCommentSheet_(spreadsheet);
  var reviewerSheet = ensureReviewerSheet_(spreadsheet);
  var reviewerRecord = findReviewerByEmail_(reviewerSheet, reviewer.email);
  var ownerEmail = String(PropertiesService.getScriptProperties().getProperty(HSC_OWNER_PROPERTY_KEY) || '').trim().toLowerCase();
  return {
    identity: {
      authenticated: true,
      displayName: reviewerRecord ? publicDisplayName_(reviewerRecord.display_name, 'レビュアー') : '',
      needsDisplayName: !reviewerRecord
    },
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
  var publicComment;

  lock.waitLock(10000);
  try {
    var spreadsheet = getCommentSpreadsheet_(true);
    var commentSheet = ensureCommentSheet_(spreadsheet);
    var reviewerSheet = ensureReviewerSheet_(spreadsheet);
    var reviewerRecord = getOrCreateReviewer_(reviewerSheet, reviewer.email, input.displayName, createdAt);
    assertRateLimit_(reviewer.email);
    var record = {
      comment_id: commentId,
      created_at: createdAt,
      report_id: HSC_CONFIG.reportId,
      anchor_id: anchorId,
      anchor_label: anchorLabel,
      anchor_path: anchorPath,
      quote_snapshot: quoteSnapshot,
      location_url: locationUrl,
      author_email: reviewer.email,
      author_key: reviewer.key,
      author_display_name: reviewerRecord.displayName,
      body: body,
      status: '未対応',
      updated_at: createdAt
    };
    appendRecord_(commentSheet, record);
    SpreadsheetApp.flush();
    publicComment = publicComment_(record);
  } finally {
    lock.releaseLock();
  }

  return publicComment;
}

function assertReviewer_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Googleアカウントを確認できないため、コメントを投稿できません。公開範囲と実行ユーザー設定を確認してください。');
  if (HSC_CONFIG.allowedDomains.length) {
    var domain = email.split('@').pop();
    if (HSC_CONFIG.allowedDomains.indexOf(domain) === -1) throw new Error('このGoogle Workspaceアカウントではコメントを投稿できません。');
  }
  return { email: email, key: Session.getTemporaryActiveUserKey() };
}

function getOrCreateReviewer_(sheet, email, requestedDisplayName, now) {
  var existing = findReviewerByEmail_(sheet, email);
  if (existing) return { displayName: publicDisplayName_(existing.display_name, 'レビュアー') };

  var displayName = normalizeDisplayName_(requestedDisplayName);
  assertDisplayNameAvailable_(sheet, email, displayName);
  appendRecord_(sheet, {
    author_email: email,
    display_name: displayName,
    created_at: now,
    updated_at: now
  });
  return { displayName: displayName };
}

function findReviewerByEmail_(sheet, email) {
  var rows = readRecords_(sheet);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].author_email || '').trim().toLowerCase() === email) return rows[i];
  }
  return null;
}

function assertDisplayNameAvailable_(sheet, email, displayName) {
  var requestedKey = normalizeDisplayNameKey_(displayName);
  var rows = readRecords_(sheet);
  for (var i = 0; i < rows.length; i += 1) {
    var rowEmail = String(rows[i].author_email || '').trim().toLowerCase();
    var rowDisplayName = String(rows[i].display_name || '');
    if (rowEmail !== email && safeDisplayNameKey_(rowDisplayName) === requestedKey) {
      throw new Error('この表示名は利用できません。別の表示名を入力してください。');
    }
  }
}

function normalizeDisplayName_(value) {
  var text = String(value || '');
  if (typeof text.normalize === 'function') text = text.normalize('NFKC');
  text = text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) throw new Error('表示名を入力してください。');
  if (text.length > 40) throw new Error('表示名は40文字以内にしてください。');
  if (text.indexOf('@') !== -1) throw new Error('メールアドレスを含まない表示名を入力してください。');
  return text;
}

function normalizeDisplayNameKey_(value) {
  return normalizeDisplayName_(value).toLowerCase();
}

function safeDisplayNameKey_(value) {
  try { return normalizeDisplayNameKey_(value); }
  catch (error) { return ''; }
}

function publicDisplayName_(value, fallback) {
  try { return normalizeDisplayName_(value); }
  catch (error) { return fallback || 'レビュアー'; }
}

function assertRateLimit_(email) {
  var bucket = Math.floor(new Date().getTime() / (HSC_RATE_LIMIT_SECONDS * 1000));
  var cache = CacheService.getScriptCache();
  var key = 'HSC_RATE_' + hashPrivateValue_(email) + '_' + bucket;
  var count = Number(cache.get(key) || 0);
  if (count >= HSC_RATE_LIMIT_MAX) throw new Error('投稿が続いています。少し待ってから再度お試しください。');
  cache.put(key, String(count + 1), HSC_RATE_LIMIT_SECONDS + 10);
}

function hashPrivateValue_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
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
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    spreadsheetId = properties.getProperty(HSC_PROPERTY_KEY);
    if (spreadsheetId) {
      try { return SpreadsheetApp.openById(spreadsheetId); }
      finally { lock.releaseLock(); }
    }
  }
  try {
    var spreadsheet = SpreadsheetApp.create(HSC_CONFIG.spreadsheetName);
    properties.setProperty(HSC_PROPERTY_KEY, spreadsheet.getId());
    ensureCommentSheet_(spreadsheet);
    ensureReviewerSheet_(spreadsheet);
    return spreadsheet;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function ensureCommentSheet_(spreadsheet) {
  var sheet = ensureSheet_(spreadsheet, HSC_COMMENT_SHEET_NAME, HSC_COMMENT_HEADERS);
  var headerMap = getHeaderMap_(sheet);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, Math.max(sheet.getLastColumn(), HSC_COMMENT_HEADERS.length), 150);
  setColumnWidthByHeader_(sheet, headerMap, 'anchor_path', 360);
  setColumnWidthByHeader_(sheet, headerMap, 'quote_snapshot', 420);
  setColumnWidthByHeader_(sheet, headerMap, 'location_url', 360);
  setColumnWidthByHeader_(sheet, headerMap, 'body', 520);
  return sheet;
}

function ensureReviewerSheet_(spreadsheet) {
  var sheet = ensureSheet_(spreadsheet, HSC_REVIEWER_SHEET_NAME, HSC_REVIEWER_HEADERS);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, HSC_REVIEWER_HEADERS.length, 220);
  return sheet;
}

function ensureSheet_(spreadsheet, name, requiredHeaders) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    var sheets = spreadsheet.getSheets();
    sheet = sheets.length === 1 && sheets[0].getLastRow() === 0
      ? sheets[0].setName(name)
      : spreadsheet.insertSheet(name);
  }
  ensureHeaders_(sheet, requiredHeaders);
  var lastColumn = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  sheet.getRange(1, 1, 1, lastColumn)
    .setBackground('#24262b')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), lastColumn).createFilter();
  return sheet;
}

function ensureHeaders_(sheet, requiredHeaders) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  var present = {};
  existing.forEach(function (header) { if (header) present[header] = true; });
  var missing = requiredHeaders.filter(function (header) { return !present[header]; });
  if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var map = {};
  headers.forEach(function (header, index) {
    var name = String(header || '').trim();
    if (name && typeof map[name] === 'undefined') map[name] = index;
  });
  return map;
}

function setColumnWidthByHeader_(sheet, headerMap, header, width) {
  if (typeof headerMap[header] !== 'undefined') sheet.setColumnWidth(headerMap[header] + 1, width);
}

function appendRecord_(sheet, record) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var row = headers.map(function (header) {
    return safeSheetText_(record[String(header || '').trim()]);
  });
  sheet.appendRow(row);
}

function readRecords_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues().map(function (row) {
    var record = {};
    headers.forEach(function (header, index) {
      if (header) record[header] = stripSheetEscape_(row[index]);
    });
    return record;
  });
}

function readComments_(spreadsheet) {
  var sheet = ensureCommentSheet_(spreadsheet);
  var records = readRecords_(sheet);
  return records.slice(Math.max(0, records.length - 500)).reverse().filter(function (record) {
    return record.comment_id && record.status !== '削除';
  }).map(publicComment_);
}

function publicComment_(record) {
  return {
    id: String(record.comment_id || ''),
    createdAt: String(record.created_at || ''),
    anchorId: String(record.anchor_id || ''),
    anchorLabel: String(record.anchor_label || ''),
    anchorPath: String(record.anchor_path || record.anchor_label || ''),
    quoteSnapshot: String(record.quote_snapshot || ''),
    locationUrl: String(record.location_url || ''),
    authorDisplayName: publicDisplayName_(record.author_display_name, '既存レビュアー'),
    body: String(record.body || ''),
    status: String(record.status || '未対応')
  };
}

function normalizeField_(value, label, maxLength, required) {
  var text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .trim();
  if (required && !text) throw new Error(label + 'を入力してください。');
  if (text.length > maxLength) throw new Error(label + 'は' + maxLength + '文字以内にしてください。');
  return text;
}

function safeSheetText_(value) {
  var text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function stripSheetEscape_(value) {
  var text = String(value == null ? '' : value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}
