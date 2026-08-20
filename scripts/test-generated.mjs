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
  constructor(sheet, row, column, rows = 1, columns = 1) { Object.assign(this, { sheet, row, column, rows, columns }); }
  ensure() {
    const rowCount = this.row - 1 + this.rows;
    const columnCount = this.column - 1 + this.columns;
    while (this.sheet.values.length < rowCount) this.sheet.values.push([]);
    this.sheet.values.forEach((row) => { while (row.length < columnCount) row.push(''); });
  }
  setValues(values) {
    this.ensure();
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.columns; c += 1) this.sheet.values[this.row - 1 + r][this.column - 1 + c] = values[r][c];
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
  constructor(spreadsheet, name) { this.spreadsheet = spreadsheet; this.name = name; this.values = []; this.filter = null; }
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

const context = {
  CacheService: { getScriptCache() { return { get(key) { return cache.get(key) || null; }, put(key, value) { cache.set(key, value); } }; } },
  console: { log() {} },
  Date,
  encodeURIComponent,
  HtmlService: { createHtmlOutputFromFile() { return { setTitle() { return this; }, addMetaTag() { return this; } }; } },
  LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
  Math,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) { return properties.get(key) || null; },
        setProperty(key, value) { properties.set(key, value); },
        deleteProperty(key) { properties.delete(key); },
      };
    },
  },
  ScriptApp: { getService() { return { getUrl() { return 'https://script.google.com/macros/s/test/exec'; } }; } },
  Session: {
    getActiveUser() { return { getEmail() { return activeEmail; } }; },
    getEffectiveUser() { return { getEmail() { return effectiveEmail; } }; },
    getScriptTimeZone() { return 'Asia/Tokyo'; },
  },
  SpreadsheetApp: {
    create(name) { const sheet = new FakeSpreadsheet(name); spreadsheets.set(sheet.id, sheet); return sheet; },
    openById(id) { const sheet = spreadsheets.get(id); if (!sheet) throw new Error('missing sheet'); return sheet; },
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

const tokenA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const tokenB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const tokenFormula = 'ffffffffffffffffffffffffffffffff';
const tokenRate = 'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr';

function rowFrom(headers, record) { return headers.map((header) => record[header] ?? ''); }
function recordsFor(sheet) {
  const headers = sheet.values[0].map(String);
  return sheet.values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}
function payload(token, overrides = {}) {
  return {
    reviewerToken: token,
    anchorId: 'privacy-design',
    anchorLabel: 'プライバシー設計',
    anchorPath: '概要 ＞ プライバシー設計',
    quoteSnapshot: '表示名はブラウザに保持',
    body: '確認しました',
    ...overrides,
  };
}
function assertPublic(value, forbidden = []) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /authorEmail|author_email|author_key|reviewerToken/i);
  forbidden.forEach((item) => assert.ok(!serialized.includes(item), `public payload leaked ${item}`));
}

// Existing comments, columns, and private legacy email data survive migration.
const legacySpreadsheet = context.SpreadsheetApp.create('Legacy comments');
const legacySheet = legacySpreadsheet.getSheets()[0].setName('comments');
const legacyHeaders = [
  'body', 'custom_notes', 'comment_id', 'status', 'author_email', 'created_at',
  'anchor_id', 'anchor_label', 'anchor_path', 'quote_snapshot', 'location_url',
  'report_id', 'author_key', 'updated_at',
];
legacySheet.appendRow(legacyHeaders);
legacySheet.appendRow(rowFrom(legacyHeaders, {
  body: '旧コメント', custom_notes: 'preserve me', comment_id: 'legacy-1', status: '未対応',
  author_email: 'legacy@example.com', created_at: '2026/08/01 10:00', anchor_id: 'legacy',
  anchor_label: '旧セクション', anchor_path: '旧セクション', quote_snapshot: '旧本文',
  location_url: 'https://example.com/?anchor=legacy', report_id: 'legacy-report',
  author_key: 'legacy-private-key', updated_at: '2026/08/01 10:00',
}));
properties.set(context.HSC_PROPERTY_KEY, legacySpreadsheet.getId());

context.setupComments();
assert.ok(legacySheet.values[0].includes('author_display_name'));
const reviewersSheet = legacySpreadsheet.getSheetByName('reviewers');
assert.ok(reviewersSheet.values[0].includes('author_key'));
assert.equal(recordsFor(legacySheet)[0].custom_notes, 'preserve me');

// Public state loads without a Google identity, including existing comments.
activeEmail = '';
const anonymousState = context.getCommentState({ reviewerToken: tokenA });
assert.equal(anonymousState.identity.needsDisplayName, true);
assert.equal(anonymousState.comments[0].authorDisplayName, '既存レビュアー');
assert.equal('spreadsheetUrl' in anonymousState, false);
assertPublic(anonymousState, [tokenA, 'legacy@example.com']);

// setupComments cannot be invoked from an anonymous or different-user web session.
assert.throws(
  () => context.setupComments(),
  (error) => error.message === 'Apps Scriptエディタから、デプロイ所有者のアカウントで実行してください。',
);
activeEmail = 'viewer@example.com';
assert.throws(() => context.setupComments());
activeEmail = 'owner@example.com';

// First post registers a browser token hash and display name without storing email.
const first = context.addComment(payload(tokenA, {
  displayName: ' Alice ', body: '=2+2', email: 'spoof@example.com', authorEmail: 'spoof@example.com',
}));
assert.equal(first.authorDisplayName, 'Alice');
assertPublic(first, [tokenA, 'owner@example.com', 'spoof@example.com']);

const commentsSheet = legacySpreadsheet.getSheetByName('comments');
const storedFirst = recordsFor(commentsSheet).find((record) => record.comment_id === first.id);
const reviewerA = recordsFor(reviewersSheet).find((record) => record.display_name === 'Alice');
assert.equal(storedFirst.author_email, '');
assert.notEqual(storedFirst.author_key, tokenA);
assert.equal(storedFirst.author_display_name, 'Alice');
assert.equal(storedFirst.body, "'=2+2");
assert.equal(reviewerA.author_email, '');
assert.equal(reviewerA.author_key, storedFirst.author_key);

// Later posts with the same browser token keep the registered name.
const second = context.addComment(payload(tokenA, { displayName: '別名', body: '<img src=x onerror=alert(1)>' }));
assert.equal(second.authorDisplayName, 'Alice');
const knownState = context.getCommentState({ reviewerToken: tokenA });
assert.equal(knownState.identity.displayName, 'Alice');
assert.equal(knownState.identity.needsDisplayName, false);
assertPublic(knownState, [tokenA, 'legacy@example.com']);

// Another browser may use the same human-readable name; identity is intentionally non-strict.
const sameName = context.addComment(payload(tokenB, { displayName: 'Alice' }));
assert.equal(sameName.authorDisplayName, 'Alice');
assert.equal(recordsFor(reviewersSheet).filter((record) => record.display_name === 'Alice').length, 2);

// Display names reject accidental email disclosure and formula injection is escaped.
assert.throws(
  () => context.addComment(payload('cccccccccccccccccccccccccccccccc', { displayName: 'alice＠example.com' })),
  (error) => error.message === 'メールアドレスを含まない表示名を入力してください。',
);
const formula = context.addComment(payload(tokenFormula, { displayName: '+Formula', body: '-1+1' }));
const formulaStored = recordsFor(commentsSheet).find((record) => record.comment_id === formula.id);
const formulaReviewer = recordsFor(reviewersSheet).find((record) => record.author_key === formulaStored.author_key);
assert.equal(formulaReviewer.display_name, "'+Formula");
assert.equal(formulaStored.body, "'-1+1");
assert.equal(formula.authorDisplayName, '+Formula');

// Missing and malformed browser tokens are rejected without revealing private data.
for (const invalid of ['', 'short', 'email@example.com', tokenA.repeat(5)]) {
  assert.throws(
    () => context.addComment(payload(invalid, { displayName: '匿名' })),
    (error) => error.message === '投稿者情報を保存できませんでした。ページを再読み込みして再度お試しください。' && !/@/.test(error.message),
  );
}

// Per-browser rate limiting allows 10 posts per minute and rejects the next.
for (let index = 0; index < 10; index += 1) {
  context.addComment(payload(tokenRate, { displayName: index === 0 ? 'Rate User' : 'ignored', body: `rate ${index}` }));
}
assert.throws(
  () => context.addComment(payload(tokenRate, { body: 'rate overflow' })),
  (error) => error.message === '投稿が続いています。少し待ってから再度お試しください。',
);

// User-generated values are rendered with textContent and private identifiers never enter public DTOs.
assert.match(html, /node\.textContent = text/);
assert.match(html, /window\.localStorage/);
assert.doesNotMatch(html, /innerHTML\s*=\s*item\.|authorEmail|author_key|reviewer\.email/);
assert.doesNotMatch(code, /People\.People|AdminDirectory|Directory\s*API/i);

console.log('html-share-commentable display-name persistence and migration tests passed');
