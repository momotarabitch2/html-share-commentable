#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node validate.mjs /absolute/output-dir');

const [code, html, setup] = await Promise.all([
  readFile(resolve(outputDir, 'Code.gs'), 'utf8'),
  readFile(resolve(outputDir, 'Index.html'), 'utf8'),
  readFile(resolve(outputDir, 'SETUP.html'), 'utf8'),
]);

assert.match(code, /function doGet\(\)/);
assert.match(code, /function setupComments\(\)/);
assert.match(code, /function getCommentState\(payload\)/);
assert.match(code, /function addComment\(payload\)/);
assert.match(code, /SpreadsheetApp\.create\(/);
assert.match(code, /LockService\.getScriptLock\(\)/);
assert.match(code, /HSC_REVIEWER_SHEET_NAME = 'reviewers'/);
assert.match(code, /author_display_name/);
assert.match(code, /normalizeReviewerToken_/);
assert.match(code, /hashPrivateValue_\(reviewerToken\)/);
assert.match(code, /function normalizeDisplayName_\(value\)/);
assert.match(code, /\\u200b-\\u200f/);
assert.match(code, /CacheService\.getScriptCache\(\)/);
assert.match(code, /needsDisplayName/);
assert.match(code, /authorDisplayName/);
assert.match(code, /anchor_path/);
assert.match(code, /location_url/);
assert.doesNotMatch(code, /authorEmail\s*:/);
assert.doesNotMatch(code, /authorKey\s*:/);
assert.doesNotMatch(code, /identity\s*:\s*reviewer\.email/);
assert.doesNotMatch(code, /function assertReviewer_/);
assert.doesNotMatch(code, /allowedDomains|allowed-domain/);
assert.doesNotMatch(code, /People\s*API|People\.People|AdminDirectory|Directory\s*API/i);
assert.doesNotMatch(code, /__HSC_[A-Z_]+__/);
new Function(code);

assert.match(html, /HSC:STYLE:START/);
assert.match(html, /HSC:CLIENT:START/);
assert.match(html, /window\.__HSC_CONFIG__/);
assert.match(html, /data-hsc-anchor/);
assert.match(html, /\.getCommentState\(/);
assert.match(html, /\.addComment\(/);
assert.match(html, /authorDisplayName/);
assert.match(html, /needsDisplayName/);
assert.match(html, /localStorage/);
assert.match(html, /reviewerToken/);
assert.match(html, /初回投稿時に表示名を入力します/);
assert.doesNotMatch(html, /authorEmail|author_key|reviewer\.email/);
const client = html.match(/<!-- HSC:CLIENT:START -->[\s\S]*?<script>window\.__HSC_CONFIG__=[\s\S]*?<\/script>\s*<script>([\s\S]*?)<\/script>\s*<!-- HSC:CLIENT:END -->/)?.[1];
assert.ok(client, 'Injected client script was not found');
new Function(client);

assert.match(setup, /https:\/\/script\.new/);
assert.match(setup, /Google Chrome/);
assert.match(setup, /Codex AppやClaude Appの内蔵ブラウザ/);
assert.match(setup, /Code\.gsをコピー/);
assert.match(setup, /Index\.htmlをコピー/);
assert.match(setup, /setupComments/);
assert.match(setup, /このアプリはGoogleで確認されていません/);
assert.match(setup, /詳細/);
assert.match(setup, /安全ではないページ/);
assert.match(setup, /表示名はそのブラウザに保存/);
assert.match(setup, /アクセスできるユーザー/);
assert.match(setup, /@camp-fire\.jp/);
assert.match(setup, /Chromeプロファイル/);
assert.match(setup, /reviewers/);
assert.match(setup, /既存レビュアー/);
assert.match(setup, /新バージョン/);
assert.match(setup, /新しいデプロイ/);
assert.match(setup, /新しいコメントではGoogleメールを取得・保存しません/);
assert.match(setup, /デプロイを管理/);
const setupClient = setup.match(/<script>([\s\S]*?)<\/script><\/body><\/html>/)?.[1];
assert.ok(setupClient, 'Setup guide client script was not found');
new Function(setupClient);

console.log('html-share-commentable bundle validation passed');
