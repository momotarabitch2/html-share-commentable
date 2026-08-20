#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const values = {};
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  if (!key.startsWith('--')) continue;
  const name = key.slice(2);
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
  if (name === 'allowed-domain') {
    values[name] ??= [];
    values[name].push(value);
  } else values[name] = value;
  i += 1;
}

if (!values.input) throw new Error('Usage: node generate.mjs --input /absolute/report.html --output /absolute/output-dir [--title "Title"] [--allowed-domain example.com]');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const inputPath = resolve(values.input);
const outputDir = resolve(values.output || resolve(dirname(inputPath), `${basename(inputPath, extname(inputPath))}-commentable`));
const source = await readFile(inputPath, 'utf8');

if (/HSC:CLIENT:START/.test(source)) throw new Error('This HTML already contains the html-share-commentable client.');

const localRefs = [];
for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  const ref = match[1].trim();
  if (!ref || /^(?:https?:|data:|mailto:|tel:|#|javascript:)/i.test(ref)) continue;
  localRefs.push(ref);
}
if (localRefs.length) {
  throw new Error(`The HTML is not self-contained. Inline these local references first:\n- ${[...new Set(localRefs)].slice(0, 20).join('\n- ')}`);
}

const decodeText = (value) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const inferredTitle = decodeText(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || basename(inputPath, extname(inputPath));
const title = values.title || inferredTitle;
const projectName = values['project-name'] || `${title} コメント共有`;
const spreadsheetName = values['spreadsheet-name'] || `${title} コメント`;
const allowedDomains = (values['allowed-domain'] || []).map((domain) => domain.trim().toLowerCase()).filter(Boolean);
// Keep the backing Sheet stable when the HTML contents are updated.
const reportId = createHash('sha256').update(`${title}\n${basename(inputPath)}`).digest('hex').slice(0, 12);
const hscConfig = { reportId, title, spreadsheetName, allowedDomains, maxLength: 1000 };

const [style, client, codeTemplate] = await Promise.all([
  readFile(resolve(skillDir, 'assets/comment-style.css'), 'utf8'),
  readFile(resolve(skillDir, 'assets/comment-client.js'), 'utf8'),
  readFile(resolve(skillDir, 'assets/Code.gs.tpl'), 'utf8'),
]);

const clientConfig = JSON.stringify({ title, maxLength: 1000 }).replace(/</g, '\\u003c');
const headInjection = `\n  <!-- HSC:STYLE:START -->\n  <meta name="robots" content="noindex, nofollow, noarchive">\n  ${/<base\b/i.test(source) ? '' : '<base target="_top">\n  '}<style>\n${style.trim()}\n  </style>\n  <!-- HSC:STYLE:END -->\n`;
const bodyInjection = `\n  <!-- HSC:CLIENT:START -->\n  <script>window.__HSC_CONFIG__=${clientConfig};</script>\n  <script>\n${client.trim()}\n  </script>\n  <!-- HSC:CLIENT:END -->\n`;

let indexHtml = source;
if (/<\/head>/i.test(indexHtml)) indexHtml = indexHtml.replace(/<\/head>/i, `${headInjection}</head>`);
else indexHtml = headInjection + indexHtml;
if (/<\/body>/i.test(indexHtml)) indexHtml = indexHtml.replace(/<\/body>/i, `${bodyInjection}</body>`);
else indexHtml += bodyInjection;

const codeGs = codeTemplate.replace('__HSC_CONFIG_JSON__', JSON.stringify(hscConfig, null, 2));

const targetPaths = ['Code.gs', 'Index.html', 'SETUP.html'].map((name) => resolve(outputDir, name));
for (const target of targetPaths) {
  try { await access(target); throw new Error(`Refusing to overwrite existing file: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function b64(value) { return Buffer.from(value, 'utf8').toString('base64'); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const setupHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(projectName)} セットアップ</title>
<style>
:root{color-scheme:light;--ink:#20242c;--muted:#667085;--line:#dfe3ea;--blue:#2864dc;--bg:#f5f7fa}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(920px,calc(100% - 32px));margin:42px auto 80px}h1{margin:0;font-size:30px;line-height:1.3}h2{margin:0 0 12px;font-size:20px}.lead{color:var(--muted)}.card{margin-top:18px;padding:22px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:0 5px 18px rgba(20,30,50,.05)}.step{display:inline-grid;width:28px;height:28px;margin-right:8px;place-items:center;border-radius:50%;background:#e8efff;color:var(--blue);font-weight:800}.button{display:inline-block;padding:10px 15px;border:0;border-radius:8px;background:var(--blue);color:#fff;font-weight:700;text-decoration:none;cursor:pointer}.secondary{background:#eef1f5;color:var(--ink)}textarea{width:100%;height:180px;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:9px;background:#fbfcfd;color:#343a46;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}ol{padding-left:23px}li+li{margin-top:7px}.note{padding:12px 14px;border-left:4px solid #e0a62b;background:#fff8e7}.good{padding:12px 14px;border-left:4px solid #2e9d65;background:#edfbf4}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.small{color:var(--muted);font-size:12px}code{padding:2px 5px;border-radius:4px;background:#eef1f5}@media(max-width:600px){main{width:min(100% - 20px,920px);margin-top:24px}.card{padding:17px}h1{font-size:25px}}
</style></head><body><main>
<h1>${escapeHtml(title)}をコメント共有する</h1><p class="lead">下の順番で、生成済みコードをGoogle Apps Scriptへ貼り付けてください。公開操作は使用するGoogleアカウントと公開範囲を確認しながら行います。</p>
<section class="card"><h2><span class="step">1</span>新しいApps Scriptを開く</h2><p>先にブラウザ右上のGoogleアカウントが、公開に使うアカウントか確認してください。</p><div class="row"><a class="button" href="https://script.new" target="_blank" rel="noreferrer">script.newを開く</a><span class="small">新しいApps Scriptプロジェクトが開きます</span></div></section>
<section class="card"><h2><span class="step">2</span>プロジェクト名を変更する</h2><ol><li>画面左上の「無題のプロジェクト」をクリックします。</li><li>任意の分かりやすい名前を入力します。例：<code>${escapeHtml(projectName)}</code></li><li>「名前を変更」を押します。</li></ol></section>
<section class="card"><h2><span class="step">3</span>Code.gsを全置換する</h2><ol><li>左側の「ファイル」一覧にある <code>Code.gs</code> をクリックします。</li><li>右側のコード編集欄を一度クリックします。</li><li><code>⌘ + A</code> で全部を選択し、下の「Code.gsをコピー」でコピーした内容を <code>⌘ + V</code> で貼り付けます。</li><li>画面上部の保存が完了するまで待ちます。必要なら <code>⌘ + S</code> を押します。</li></ol><button class="button copy" data-copy="code">Code.gsをコピー</button><textarea id="code" readonly aria-label="Code.gs"></textarea></section>
<section class="card"><h2><span class="step">4</span>Index.htmlを追加して全置換する</h2><ol><li>左側の「ファイル」という見出しの右にある「＋」を押します。</li><li>表示されたメニューから「HTML」を選びます。</li><li>ファイル名に <code>Index</code> と入力して確定します。<code>.html</code> は入力しません。</li><li>追加された <code>Index.html</code> の編集欄をクリックします。</li><li><code>⌘ + A</code> で全部を選択し、下の「Index.htmlをコピー」でコピーした内容を <code>⌘ + V</code> で貼り付けます。</li><li>保存が完了するまで待ちます。</li></ol><button class="button copy" data-copy="index">Index.htmlをコピー</button><textarea id="index" readonly aria-label="Index.html"></textarea></section>
<section class="card"><h2><span class="step">5</span>コメント用スプレッドシートを作る</h2><ol><li>左側で <code>Code.gs</code> をクリックします。</li><li>画面上部の「実行する関数を選択」プルダウンから <code>setupComments</code> を選びます。</li><li>その左側にある「実行」を押します。</li><li>初回の権限画面で、公開に使うGoogleアカウントを選び、スプレッドシートへのアクセスを許可します。</li><li>画面下部の実行ログに「実行完了」と表示されるまで待ちます。Google Driveに <code>${escapeHtml(spreadsheetName)}</code> が作成されます。</li></ol><p class="note">関数一覧に出ない場合は、Code.gsの保存完了を確認して選び直します。それでも出なければ画面を再読み込みしてください。</p></section>
<section class="card"><h2><span class="step">6</span>ウェブアプリとして公開する</h2><ol><li>画面右上の「デプロイ」→「新しいデプロイ」を押します。</li><li>「種類を選択」の歯車アイコンを押し、「ウェブアプリ」を選びます。</li><li>「説明」は任意です。例：<code>初回公開</code></li><li>「次のユーザーとして実行」は、内部共有なら「自分」を選びます。</li><li>「アクセスできるユーザー」は、投稿者メールを確認できるよう、通常は自分のGoogle Workspace組織内に限定する選択肢を選びます。表示名は組織によって異なります。</li><li>選択したGoogleアカウントと公開範囲を再確認して「デプロイ」を押します。</li><li>表示されたウェブアプリURL（末尾が <code>/exec</code>）をコピーします。</li></ol><p class="note">「全員」などの公開設定は、組織外へ見せる必要がある場合だけ選びます。組織外・個人Gmailを含む共有では、投稿者メールを自動取得できない場合があります。</p></section>
<section class="card"><h2><span class="step">7</span>公開後に1件テストする</h2><ol><li><code>/exec</code> URLを開きます。</li><li>コメントを1件投稿します。</li><li>HTMLのコメント欄に自分のメールとコメント場所が表示されることを確認します。</li><li>管理スプレッドシートに、投稿者、場所、対象内容、コメント、該当箇所URLが1行追加されたことを確認します。</li><li>スプレッドシートのURLからHTMLの該当箇所へ戻れることを確認します。</li></ol><p class="good">ここまで確認できたら公開完了です。</p></section>
<section class="card"><h2>HTMLを更新したとき</h2><ol><li>新しいIndex.htmlを貼り付けて保存します。</li><li>「デプロイ」→「デプロイを管理」を開きます。</li><li>対象デプロイの編集アイコンを押します。</li><li>バージョンで「新バージョン」を選び、「デプロイ」を押します。</li></ol></section>
</main><script>
const payload={code:'${b64(codeGs)}',index:'${b64(indexHtml)}'};const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));for(const key of Object.keys(payload))document.getElementById(key).value=decode(payload[key]);async function copyText(key,button){const text=document.getElementById(key).value;try{await navigator.clipboard.writeText(text)}catch(error){const area=document.getElementById(key);area.focus();area.select();document.execCommand('copy')}const old=button.textContent;button.textContent='コピーしました';setTimeout(()=>button.textContent=old,1400)}document.querySelectorAll('.copy').forEach(button=>button.addEventListener('click',()=>copyText(button.dataset.copy,button)));
</script></body></html>`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, 'Code.gs'), codeGs, 'utf8'),
  writeFile(resolve(outputDir, 'Index.html'), indexHtml, 'utf8'),
  writeFile(resolve(outputDir, 'SETUP.html'), setupHtml, 'utf8'),
]);

console.log(JSON.stringify({ input: inputPath, output: outputDir, title, projectName, spreadsheetName, allowedDomains, files: targetPaths }, null, 2));
