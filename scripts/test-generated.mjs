#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const outputDir = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node test-generated.mjs /absolute/output-dir');

const [code, html] = await Promise.all([
  readFile(resolve(outputDir, 'Code.gs'), 'utf8'),
  readFile(resolve(outputDir, 'Index.html'), 'utf8'),
]);

class FakeRange {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  ensure() {
    const requiredRows = this.row - 1 + this.rows;
    const requiredColumns = this.column - 1 + this.columns;
    while (this.sheet.values.length < requiredRows) this.sheet.values.push([]);
    this.sheet.values.forEach((row) => { while (row.length < requiredColumns) row.push(''); });
  }

  setValues(values) {
    this.ensure();
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.columns; c += 1) {
        this.sheet.values[this.row - 1 + r][this.column - 1 + c] = values[r][c];
      }
    }
    return this;
  }

  getDisplayValues() {
    this.ensure();
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => {
      const value = this.sheet.values[this.row - 1 + r][this.column - 1 + c];
      return value == null ? '' : String(value);
    }));
  }

  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  createFilter() { this.sheet.filter = {}; return this; }
}

class FakeSheet {
  constructor(spreadsheet, name) {
    this.spreadsheet = spreadsheet;
    this.name = name;
    this.values = [];
    this.filter = null;
  }

  getName() { return this.name; }
  setName(name) { this.name = name; return this; }
  getLastRow() {
    for (let i = this.values.length - 1; i >= 0; i -= 1) {
      if (this.values[i].some((value) => value !== '' && value != null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
  appendRow(row) { this.values.push([...row]); return this; }
  getFilter() { return this.filter; }
  setFrozenRows() { return this; }
  setColumnWidths() { return this; }
  setColumnWidth() { return this; }
}

let spreadsheetSequence = 0;
class FakeSpreadsheet {
  constructor(name) {
    spreadsheetSequence += 1;
    this.name = name;
    this.id = `sheet-${spreadsheetSequence}`;
    this.sheets = [new FakeSheet(this, 'Sheet1')];
  }

  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) || null; }
  insertSheet(name) { const sheet = new FakeSheet(this, name); this.sheets.push(sheet); return sheet; }
}

const spreadsheets = new Map();
const properties = new Map();
const cache = new Map();
let activeEmail = 'owner@example.com';
let effectiveEmail = 'owner@example.com';
let uuidSequence = 0;

const scriptProperties = {
  getProperty(key) { return properties.get(key) || null; },
  setProperty(key, value) { properties.set(key, value); },
  deleteProperty(key) { properties.delete(key); },
};

const context = {
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return cache.get(key) || null; },
        put(key, value) { cache.set(key, value); },
      };
    },
  },
  console: { log() {} },
  Date,
  encodeURIComponent,
  HtmlService: {
    createHtmlOutputFromFile() {
      return { setTitle() { return this; }, addMetaTag() { return this; } };
    },
  },
  LockService: {
    getScriptLock() { return { waitLock() {}, releaseLock() {} }; },
  },
  Math,
  PropertiesService: { getScriptProperties() { return scriptProperties; } },
  ScriptApp: { getService() { return { getUrl() { return 'https://script.google.com/macros/s/test/exec'; } }; } },
  Session: {
    getActiveUser() { return { getEmail() { return activeEmail; } }; },
    getEffectiveUser() { return { getEmail() { return effectiveEmail; } }; },
    getTemporaryActiveUserKey() { return `key:${activeEmail}`; },
    getScriptTimeZone() { return 'Asia/Tokyo'; },
  },
  SpreadsheetApp: {
    create(name) { const spreadsheet = new FakeSpreadsheet(name); spreadsheets.set(spreadsheet.id, spreadsheet); return spreadsheet; },
    openById(id) { const spreadsheet = spreadsheets.get(id); if (!spreadsheet) throw new Error('missing sheet'); return spreadsheet; },
    flush() {},
  },
  String,
  Utilities: {
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    base64EncodeWebSafe(bytes) { return Buffer.from(bytes).toString('base64url'); },
    computeDigest(_algorithm, value) { return [...createHash('sha256').update(String(value)).digest()]; },
    formatDate(date) { return date.toISOString().slice(0, 16).replace('T', ' '); },
    getUuid() { uuidSequence += 1; return `comment-${uuidSequence}`; },
  },
};

vm.createContext(context);
vm.runInContext(code, context, { filename: 'Code.gs' });

function setActiveEmail(email) { activeEmail = email; }
function setEffectiveEmail(email) { effectiveEmail = email; }
function rowFrom(headers, record) { return headers.map((header) => record[header] ?? ''); }
function recordsFor(sheet) {
  const headers = sheet.values[0].map(String);
  return sheet.values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}
function commentPayload(overrides = {}) {
  return {
    anchorId: 'privacy-design',
    anchorLabel: 'プライバシー設計',
    anchorPath: '概要 ＞ プライバシー設計',
    quoteSnapshot: '表示名は公開、メールは管理Sheetのみ',
    body: '確認しました',
    ...overrides,
  };
}
function assertPrivatePublicPayload(value, forbiddenEmails = []) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /authorEmail|author_email|author_key|key:/i);
  forbiddenEmails.forEach((email) => assert.ok(!serialized.includes(email), `public payload leaked ${email}`));
}

// Existing-sheet migration: shuffled headers, extra column, and no author_display_name.
const legacySpreadsheet = context.SpreadsheetApp.create('Legacy comments');
const legacySheet = legacySpreadsheet.getSheets()[0].setName('comments');
const legacyHeaders = [
  'body', 'custom_notes', 'comment_id', 'status', 'author_email', 'created_at',
  'anchor_id', 'anchor_label', 'anchor_path', 'quote_snapshot', 'location_url',
  'report_id', 'author_key', 'updated_at',
];
legacySheet.appendRow(legacyHeaders);
legacySheet.appendRow(rowFrom(legacyHeaders, {
  body: '旧コメント',
  custom_notes: 'preserve me',
  comment_id: 'legacy-1',
  status: '未対応',
  author_email: 'legacy@example.com',
  created_at: '2026/08/01 10:00',
  anchor_id: 'legacy',
  anchor_label: '旧セクション',
  anchor_path: '旧セクション',
  quote_snapshot: '旧本文',
  location_url: 'https://example.com/?anchor=legacy',
  report_id: 'legacy-report',
  author_key: 'legacy-private-key',
  updated_at: '2026/08/01 10:00',
}));
properties.set(context.HSC_PROPERTY_KEY, legacySpreadsheet.getId());

setActiveEmail('owner@example.com');
context.setupComments();
assert.ok(legacySheet.values[0].includes('author_display_name'));
assert.ok(legacySpreadsheet.getSheetByName('reviewers'));
assert.equal(recordsFor(legacySheet)[0].custom_notes, 'preserve me');

const ownerState = context.getCommentState();
assert.equal(ownerState.identity.authenticated, true);
assert.equal(ownerState.identity.needsDisplayName, true);
assert.equal(ownerState.comments[0].authorDisplayName, '既存レビュアー');
assert.ok(ownerState.spreadsheetUrl);
assertPrivatePublicPayload(ownerState, ['owner@example.com', 'legacy@example.com']);

setActiveEmail('viewer@example.com');
setEffectiveEmail('viewer@example.com');
assert.throws(
  () => context.setupComments(),
  (error) => error.message === '管理者アカウントでセットアップを実行してください。' && !/@/.test(error.message),
);
const viewerState = context.getCommentState();
assert.equal(viewerState.spreadsheetUrl, '');
assertPrivatePublicPayload(viewerState, ['owner@example.com', 'viewer@example.com', 'legacy@example.com']);
setEffectiveEmail('owner@example.com');

// First registration keeps email private while storing the mapping in private sheets.
setActiveEmail('alice@example.com');
const aliceFirst = context.addComment(commentPayload({
  displayName: ' Alice ',
  body: '=2+2',
  email: 'spoof@example.com',
  authorEmail: 'spoof@example.com',
  authorKey: 'spoof-key',
}));
assert.equal(aliceFirst.authorDisplayName, 'Alice');
assertPrivatePublicPayload(aliceFirst, ['alice@example.com']);

const commentsSheet = legacySpreadsheet.getSheetByName('comments');
const reviewersSheet = legacySpreadsheet.getSheetByName('reviewers');
const commentRecords = recordsFor(commentsSheet);
const aliceStored = commentRecords.find((record) => record.comment_id === aliceFirst.id);
assert.equal(aliceStored.author_email, 'alice@example.com');
assert.notEqual(aliceStored.author_key, 'spoof-key');
assert.equal(aliceStored.author_display_name, 'Alice');
assert.equal(aliceStored.body, "'=2+2");
const aliceReviewer = recordsFor(reviewersSheet).find((record) => record.author_email === 'alice@example.com');
assert.equal(aliceReviewer.display_name, 'Alice');

// A later client value cannot overwrite the server-side name.
const aliceSecond = context.addComment(commentPayload({ displayName: '別名', body: '<img src=x onerror=alert(1)>' }));
assert.equal(aliceSecond.authorDisplayName, 'Alice');
assertPrivatePublicPayload(aliceSecond, ['alice@example.com']);

const aliceState = context.getCommentState();
assert.equal(aliceState.identity.displayName, 'Alice');
assert.equal(aliceState.identity.needsDisplayName, false);
assert.equal(aliceState.spreadsheetUrl, '');
assertPrivatePublicPayload(aliceState, ['alice@example.com', 'legacy@example.com']);

// Even an accidental email-like value entered by an administrator is never exposed as a display name.
const reviewerEmailColumn = reviewersSheet.values[0].indexOf('author_email');
const reviewerNameColumn = reviewersSheet.values[0].indexOf('display_name');
const aliceReviewerRow = reviewersSheet.values.findIndex((row) => row[reviewerEmailColumn] === 'alice@example.com');
reviewersSheet.values[aliceReviewerRow][reviewerNameColumn] = 'accidental@example.com';
const sanitizedAliceState = context.getCommentState();
assert.equal(sanitizedAliceState.identity.displayName, 'レビュアー');
assertPrivatePublicPayload(sanitizedAliceState, ['alice@example.com', 'accidental@example.com']);
reviewersSheet.values[aliceReviewerRow][reviewerNameColumn] = 'Alice';

// A different email cannot claim the same normalized display name.
setActiveEmail('bob@example.com');
assert.throws(
  () => context.addComment(commentPayload({ displayName: '  ALICE  ' })),
  (error) => error.message === 'この表示名は利用できません。別の表示名を入力してください。' && !error.message.includes('alice@example.com'),
);
assert.throws(
  () => context.addComment(commentPayload({ displayName: 'A\u200Blice' })),
  (error) => error.message === 'この表示名は利用できません。別の表示名を入力してください。',
);
assert.throws(
  () => context.addComment(commentPayload({ displayName: 'bob＠example.com' })),
  (error) => error.message === 'メールアドレスを含まない表示名を入力してください。',
);

// Sheet formula injection is escaped for both display names and bodies.
setActiveEmail('formula@example.com');
const formulaComment = context.addComment(commentPayload({ displayName: '+Formula', body: '-1+1' }));
const formulaReviewer = recordsFor(reviewersSheet).find((record) => record.author_email === 'formula@example.com');
const formulaStored = recordsFor(commentsSheet).find((record) => record.comment_id === formulaComment.id);
assert.equal(formulaReviewer.display_name, "'+Formula");
assert.equal(formulaStored.body, "'-1+1");
assert.equal(formulaComment.authorDisplayName, '+Formula');

// The server rejects unauthenticated posting.
setActiveEmail('');
assert.throws(
  () => context.addComment(commentPayload({ displayName: '匿名' })),
  (error) => error.message.includes('Googleアカウントを確認できないため') && !/@/.test(error.message),
);

// Per-email rate limiting allows 10 posts in a minute and rejects the next one.
setActiveEmail('rate@example.com');
for (let index = 0; index < 10; index += 1) {
  context.addComment(commentPayload({ displayName: index === 0 ? 'Rate User' : 'ignored', body: `rate ${index}` }));
}
assert.throws(
  () => context.addComment(commentPayload({ body: 'rate overflow' })),
  (error) => error.message === '投稿が続いています。少し待ってから再度お試しください。',
);

// The generated client renders user data with textContent and has no private identity field.
assert.match(html, /node\.textContent = text/);
assert.doesNotMatch(html, /innerHTML\s*=\s*item\.|authorEmail|author_key|reviewer\.email/);
assert.doesNotMatch(code, /People\.People|AdminDirectory|Directory\s*API/i);

console.log('html-share-commentable privacy and migration tests passed');
