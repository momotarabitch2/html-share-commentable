---
name: html-share-commentable
description: Convert an existing self-contained HTML file into a Google Apps Script web app with anchored review comments stored in Google Sheets, and generate a copy-friendly setup guide. Use when a completed HTML artifact needs internal sharing, identifiable commenters, location-aware comments, and a user-led Apps Script setup.
---

# HTML Share Commentable

Turn a completed HTML artifact into a commentable Google Apps Script web app. Keep the original HTML's content and design intact; add only the review layer and deployment bundle.

## Inputs and boundaries

- Require the absolute path to one completed HTML file.
- The HTML must be self-contained. HTTPS resources may remain external, but local relative CSS, JavaScript, images, and fonts must be inlined before generation.
- Ask for a title only when it cannot be inferred from `<title>`.
- Treat allowed Workspace domains as optional configuration. For reliable commenter identity, recommend sharing within the deployer's Google Workspace organization.
- Use the generated `SETUP.html` as the standard user-led path for Apps Script creation, authorization, access-scope selection, deployment, and testing.

## Generate the bundle

Run:

```bash
node scripts/generate.mjs \
  --input /absolute/path/to/report.html \
  --output /absolute/path/to/report-commentable \
  [--title "Report title"] \
  [--project-name "Apps Script project name"] \
  [--spreadsheet-name "Comment sheet name"] \
  [--allowed-domain example.com]
```

The output must contain:

- `Code.gs`: Apps Script server code that creates and migrates the backing `comments` and `reviewers` sheets, identifies the active reviewer, keeps authenticated email private, reads and appends comments, creates location links, and serves `Index.html`.
- `Index.html`: the original HTML with a namespaced comment UI injected. It discovers meaningful sections, records the heading path and a text snapshot, asks for a unique display name on the first post, and deep-links back to the commented location.
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

## Identity and access

- Require the verified Google-account email from `Session.getActiveUser().getEmail()` for every post and use it only as a private server-side identity key.
- Show only `authorDisplayName` in the public comment UI. Keep authenticated email and temporary user keys out of HTML, DOM, `google.script.run` responses, and public error messages.
- On the first post, require a display name of 1–40 characters. Normalize whitespace and Unicode, remove control characters, reject values containing `@`, and enforce case-insensitive uniqueness across different emails.
- Save `author_email` and `author_display_name` in the private `comments` sheet. Save `author_email`, `display_name`, `created_at`, and `updated_at` in the private `reviewers` sheet so administrators can audit the mapping.
- For later posts from the same email, use the saved display name and ignore client attempts to overwrite it. Administrators change display names in the private `reviewers` sheet.
- Migrate existing `comments` sheets by header name, append missing columns, and preserve existing rows and column order. Render rows without `author_display_name` as `既存レビュアー` rather than falling back to email.
- Apply a light server-side per-email rate limit without exposing its private key to the client.
- A Workspace-domain restriction in `Code.gs` is defense in depth; the user still chooses the actual web-app access scope in the deployment UI.
- Explain that public or cross-domain sharing may not provide reliable identity with the default Apps Script execution model.
- Explain that hiding email protects reviewer identity in the public UI; it does not make the HTML or comment body private from people who can access the web-app URL.

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
- for internal Workspace review, recommend Execute as me and access limited to the organization;
- copy and test the `/exec` URL, post a test comment, and verify the Sheet row and deep link;
- verify that the public comment card shows only the display name while the private `comments` and `reviewers` sheets retain the display-name-to-email mapping;
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
