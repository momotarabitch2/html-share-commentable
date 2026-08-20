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
assert.match(code, /function getCommentState\(\)/);
assert.match(code, /function addComment\(payload\)/);
assert.match(code, /SpreadsheetApp\.create\(/);
assert.match(code, /LockService\.getScriptLock\(\)/);
assert.match(code, /Session\.getActiveUser\(\)\.getEmail\(\)/);
assert.match(code, /anchor_path/);
assert.match(code, /location_url/);
assert.doesNotMatch(code, /__HSC_[A-Z_]+__/);
new Function(code);

assert.match(html, /HSC:STYLE:START/);
assert.match(html, /HSC:CLIENT:START/);
assert.match(html, /window\.__HSC_CONFIG__/);
assert.match(html, /data-hsc-anchor/);
assert.match(html, /\.getCommentState\(\)/);
assert.match(html, /\.addComment\(/);
const client = html.match(/<!-- HSC:CLIENT:START -->[\s\S]*?<script>window\.__HSC_CONFIG__=[\s\S]*?<\/script>\s*<script>([\s\S]*?)<\/script>\s*<!-- HSC:CLIENT:END -->/)?.[1];
assert.ok(client, 'Injected client script was not found');
new Function(client);

assert.match(setup, /https:\/\/script\.new/);
assert.match(setup, /Code\.gsをコピー/);
assert.match(setup, /Index\.htmlをコピー/);
assert.match(setup, /setupComments/);
assert.match(setup, /新しいデプロイ/);
assert.match(setup, /アクセスできるユーザー/);
assert.match(setup, /デプロイを管理/);

console.log('html-share-commentable bundle validation passed');
