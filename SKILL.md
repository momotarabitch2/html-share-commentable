---
name: html-share-commentable
description: Convert an existing self-contained HTML file into a Google Apps Script web app with anchored, display-name-based review comments stored in Google Sheets, plus a copy-friendly setup guide. Use when a completed HTML artifact needs URL sharing, configurable Apps Script access scope, location-aware comments, and user-led setup.
---

# HTML Share Commentable

Turn a completed HTML artifact into a commentable Google Apps Script web app. Keep the original HTML's content and design intact; add only the review layer and deployment bundle.

## Inputs and boundaries

- Require the absolute path to one completed HTML file.
- The HTML must be self-contained. HTTPS resources may remain external, but local relative CSS, JavaScript, images, and fonts must be inlined before generation.
- Ask for a title only when it cannot be inferred from `<title>`.
- Keep access control separate from commenter naming. The user chooses the actual viewing scope in the Apps Script deployment UI.
- Use the generated `SETUP.html` as the standard user-led path for Apps Script creation, authorization, access-scope selection, deployment, and testing.

## Generate the bundle

Run:

```bash
node scripts/generate.mjs \
  --input /absolute/path/to/report.html \
  --output /absolute/path/to/report-commentable \
  [--title "Report title"] \
  [--project-name "Apps Script project name"] \
  [--spreadsheet-name "Comment sheet name"]
```

The output must contain:

- `Code.gs`: Apps Script server code that creates and migrates the backing `comments` and `reviewers` sheets, maps a hashed browser-held reviewer token to a display name, reads and appends comments, creates location links, and serves `Index.html`.
- `Index.html`: the original HTML with a namespaced comment UI injected. It discovers meaningful sections, records the heading path and a text snapshot, asks for a display name on the first post in that browser, and deep-links back to the commented location.
- `SETUP.html`: the primary handoff. It embeds both generated files, provides one-click copy buttons, surfaces `https://script.new` for Chrome, and gives exact paste, authorization, access-scope, deployment, test, and update steps.

Validate every bundle:

```bash
node scripts/validate.mjs /absolute/path/to/report-commentable
```

Report bundle readiness after generation resolves all local assets and validation passes.

## Comment locations

Prefer explicit source markers when they already exist:

```html
<section data-comment-anchor="stable-id" data-comment-title="Readable title">
```

Otherwise the injected client discovers sections and articles, assigns stable-enough IDs from existing element IDs or headings, and records:

- `anchor_id`
- `anchor_label`
- `anchor_path`
- `quote_snapshot`
- `location_url`

Preserve the report's existing hierarchy. If automatic targets are clearly too broad or noisy, add a small number of `data-comment-anchor` markers to a generated working copy and regenerate.

## Display names and access

- Let the Apps Script deployment setting control who may view the HTML and comments. The generated comment code must work with organization-only, signed-in-user, and anonymous access scopes.
- On first post in a browser, require a display name of 1–40 characters. Normalize whitespace and Unicode, remove control characters, and reject values containing `@` to reduce accidental email disclosure.
- Generate a random reviewer token in the browser, keep it in `localStorage`, and send it only to server functions that need it. Hash it server-side before storing or rate-limiting; never return the raw token or stored hash in public responses.
- Map the stored token hash to the display name in the private `reviewers` sheet. Later posts from that browser use the saved server-side display name and ignore client attempts to overwrite it.
- Treat display names as lightweight labels, not verified identity. Allow the same display name from different browser tokens. A new device, browser, private window, or cleared browser storage asks for the display name again.
- Keep legacy `author_email` columns and values during migration, but leave them empty for new posts. Preserve existing rows and column order, append missing headers, and render old rows without `author_display_name` as `既存レビュアー` rather than falling back to email.
- Keep the management Sheet URL out of `getCommentState`, `addComment`, HTML, DOM, public errors, and other web-app responses. Return it only from `setupComments` run by the deployer in the Apps Script editor.
- Apply lightweight per-token and global server-side rate limits. Preserve length limits, Sheet formula-injection protection, and `textContent` rendering for user-generated strings.
- Explain that access scope controls who can open the page, while display-name persistence controls only the label shown with comments.

## Handoff

Present `SETUP.html` as the first artifact because it is easier than copying from chat. Also link `Code.gs` and `Index.html` separately for inspection.

The setup guide must use literal UI instructions, including:

- open Google Chrome before starting the Google-side work, copy `https://script.new` into Chrome's address bar, and continue the Apps Script setup in Chrome because OAuth pages can render blank in Codex App or Claude App embedded browsers;
- click the existing `Code.gs`, click the editor, press Command+A, paste, and wait for save;
- click the `+` next to Files, choose HTML, enter `Index` without `.html`, then replace the generated contents;
- click `Untitled project` and enter any understandable project name;
- select `setupComments` in the function selector beside Run and click Run;
- when Google shows `このアプリはGoogleで確認されていません`, confirm it is the project just created from the generated files, click `詳細`, click the link to the project marked `安全ではないページ`, continue to the permission screen, allow the requested access, and wait for completion;
- choose Deploy > New deployment > Web app, then deliberately choose execution identity and who has access;
- choose Execute as me, then choose the viewing scope separately: Workspace organization for internal material, signed-in users when Google login is sufficient, or everyone for login-free sharing;
- explain that Google-authenticated access can fail in browsers signed into multiple Google accounts because Apps Script does not support multi-login reliably, and recommend the intended Workspace account's Chrome profile when that occurs;
- copy and test the `/exec` URL, post a test comment, and verify the Sheet row and deep link;
- verify that the first post asks for a display name, a second post in the same browser reuses it, and the private `comments` and `reviewers` sheets contain no new author email;
- for existing deployments, replace both `Code.gs` and `Index.html`, run `setupComments` to migrate the sheets, then use Deploy > Manage deployments > Edit > New version > Deploy.

After local validation passes:

1. Open `SETUP.html` locally and leave it visible for the user. If local opening is unavailable, present it as the first clickable artifact.
2. Tell the user in chat: `SETUP.htmlを開きました。Google Apps ScriptはChromeで https://script.new を開き、以降はSETUP.htmlの手順に従ってください。`
3. Let the user proceed through the guide, including its `script.new` button and access-scope choices.

When the user explicitly asks the agent to operate Apps Script, continue through the requested UI steps and apply confirmations at the point required by the external action. After the work, report which of the completion states below were actually reached.

## Report completion accurately

Separate these states:

1. Bundle generated and locally validated.
2. Code pasted and saved in Apps Script.
3. `setupComments` authorized and the Sheet created.
4. Web app deployed with the intended access scope.
5. Live comment posting and Sheet deep link tested.

Describe local validation as state 1 and reserve live-deployment language for states 4 and 5.
