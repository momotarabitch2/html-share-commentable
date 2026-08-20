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
- 公開ページには投稿者が入力した表示名だけを表示
- 初回投稿時に表示名を登録し、同じブラウザでは保存済み表示名を継続利用
- Googleアカウントやメールアドレスに依存せず、組織内限定・ログイン必須・ログイン不要の各公開範囲で同じコメントUIを利用
- コメント用の端末IDはブラウザに保持し、Sheetにはそのハッシュだけを保存
- `Code.gs`、`Index.html`、導入手順付きの`SETUP.html`を生成
- Apps Scriptへの貼り付け、認証、公開、動作確認を`SETUP.html`で案内

Google People API、Directory API、投稿者メールは使用しません。HTMLやコメント本文へのアクセス制御は、Apps Scriptのデプロイ画面にある「アクセスできるユーザー」で設定します。社内資料ではWorkspace組織内、社外共有ではGoogleログイン必須または全員を用途に合わせて選択できます。

表示名は本人確認ではありません。別端末、別ブラウザ、シークレットウィンドウ、ブラウザデータ削除後は再入力します。

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

`test-generated.mjs`は、表示名の端末保持、匿名状態でのコメント読込、端末IDのハッシュ保存、同名利用、既存Sheet移行、数式注入対策、投稿制限をGoogle Apps Scriptのローカルモックで検証します。

## 更新

Codex Appへインストールした場合：

```bash
git -C ~/.codex/skills/html-share-commentable pull --ff-only
```

Claude App / Claude Codeへインストールした場合：

```bash
git -C ~/.claude/skills/html-share-commentable pull --ff-only
```
