# HTML Share Commentable

## インストール先

このリポジトリ自体がスキルフォルダです。利用するアプリに合わせて、次の場所へインストールします。

### Codex App

```bash
git clone https://github.com/momotarabitch2/html-share-commentable.git \
  ~/.codex/skills/html-share-commentable
```

インストール場所：`~/.codex/skills/html-share-commentable`

### Claude App / Claude Code

```bash
git clone https://github.com/momotarabitch2/html-share-commentable.git \
  ~/.claude/skills/html-share-commentable
```

インストール場所：`~/.claude/skills/html-share-commentable`

インストール後、新しいタスクまたはセッションで `$html-share-commentable` を指定して利用します。

## できること

完成済みの自己完結HTMLを、Google Apps Scriptで共有できるコメント付きWebアプリへ変換します。

- 元のHTMLへ、場所を指定できるコメントUIを追加
- 公開ページには投稿者の表示名だけを表示
- 認証済みGoogleメールは非公開の`comments` / `reviewers` Sheetだけへ保存
- 初回投稿時に表示名を登録し、同じメールでは保存済み表示名を継続利用
- 別メールによる同一表示名の登録を拒否
- `Code.gs`、`Index.html`、導入手順付きの`SETUP.html`を生成
- Apps Scriptへの貼り付け、認証、公開、動作確認を`SETUP.html`で案内

Google People APIやDirectory APIは使用せず、Apps Scriptの認証済みユーザー情報とSpreadsheet機能だけで管理します。メール非表示化は投稿者情報を公開HTMLから隠す設計であり、HTMLやコメント本文へのアクセス制御はデプロイ時の公開範囲で設定します。

## 使い方

CodexまたはClaudeへ、変換対象となる完成済みHTMLの絶対パスを渡します。

```text
$html-share-commentable /absolute/path/to/report.html をコメント共有できるようにして
```

バンドル生成後は`SETUP.html`を開き、Google側の作業をChromeで進めます。

## ローカル検証

```bash
node scripts/validate.mjs /absolute/path/to/report-commentable
node scripts/test-generated.mjs /absolute/path/to/report-commentable
```

`test-generated.mjs`は、表示名登録、メール非露出、同名登録拒否、既存Sheet移行、数式注入対策、未認証投稿拒否、レート制限をGoogle Apps Scriptのローカルモックで検証します。

## 更新

Codex Appへインストールした場合：

```bash
git -C ~/.codex/skills/html-share-commentable pull --ff-only
```

Claude App / Claude Codeへインストールした場合：

```bash
git -C ~/.claude/skills/html-share-commentable pull --ff-only
```
