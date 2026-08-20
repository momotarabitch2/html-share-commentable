---
name: html-share-commentable
description: Convert an existing self-contained HTML file into a Google Apps Script web app with anchored review comments stored in Google Sheets, and generate a copy-friendly setup guide. Use when an HTML artifact is already complete and needs internal sharing, identifiable commenters, location-aware comments, and manual Apps Script deployment. Do not use to design the underlying report or publish without the user's account and access-scope confirmation.
---

# HTML Share Commentable

Turn a completed HTML artifact into a commentable Google Apps Script web app. Keep the original HTML's content and design intact; add only the review layer and deployment bundle.

## Inputs and boundaries

- Require the absolute path to one completed HTML file.
- The HTML must be self-contained. HTTPS resources may remain external, but local relative CSS, JavaScript, images, and fonts must be inlined before generation.
- Ask for a title only when it cannot be inferred from `<title>`.
- Treat allowed Workspace domains as optional configuration. For reliable commenter identity, recommend sharing within the deployer's Google Workspace organization.
- Do not create, authorize, or deploy an Apps Script project without the user's confirmation of the active Google account and intended access scope.

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

- `Code.gs`: Apps Script server code that creates and initializes the backing spreadsheet, identifies the active reviewer, reads and appends comments, creates location links, and serves `Index.html`.
- `Index.html`: the original HTML with a namespaced comment UI injected. It discovers meaningful sections, records the heading path and a text snapshot, and deep-links back to the commented location.
- `SETUP.html`: the primary handoff. It embeds both generated files, provides one-click copy buttons, links to `https://script.new`, and gives exact paste, authorization, access-scope, deployment, test, and update steps.

Validate every bundle:

```bash
node scripts/validate.mjs /absolute/path/to/report-commentable
```

Do not claim readiness if generation reports unresolved local assets or validation fails.

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

Do not rewrite the report merely to force a specific hierarchy. If automatic targets are clearly too broad or noisy, add a small number of `data-comment-anchor` markers to a generated working copy and regenerate.

## Identity and access

- Default to verified Google-account email. If Apps Script cannot return an active-user email, disable posting rather than silently recording an anonymous comment.
- Store the same `author_email` in the HTML comment view and the Sheet.
- A Workspace-domain restriction in `Code.gs` is defense in depth; the user still chooses the actual web-app access scope in the deployment UI.
- Explain that public or cross-domain sharing may not provide reliable identity with the default Apps Script execution model.

## Handoff

Present `SETUP.html` as the first artifact because it is easier than copying from chat. Also link `Code.gs` and `Index.html` separately for inspection.

The setup guide must use literal UI instructions, including:

- click the existing `Code.gs`, click the editor, press Command+A, paste, and wait for save;
- click the `+` next to Files, choose HTML, enter `Index` without `.html`, then replace the generated contents;
- click `Untitled project` and enter any understandable project name;
- select `setupComments` in the function selector beside Run, click Run, authorize, and wait for completion;
- choose Deploy > New deployment > Web app, then deliberately choose execution identity and who has access;
- for internal Workspace review, recommend Execute as me and access limited to the organization;
- copy and test the `/exec` URL, post a test comment, and verify the Sheet row and deep link;
- for updates, use Deploy > Manage deployments > Edit > New version > Deploy.

Open `SETUP.html` locally when the user asks to proceed. Let the user click its `script.new` button after checking the intended Google account. Do not ask for passwords, cookies, tokens, or authorization codes.

## Report completion accurately

Separate these states:

1. Bundle generated and locally validated.
2. Code pasted and saved in Apps Script.
3. `setupComments` authorized and the Sheet created.
4. Web app deployed with the intended access scope.
5. Live comment posting and Sheet deep link tested.

Never describe local validation as a live deployment.
