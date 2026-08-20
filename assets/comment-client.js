(function () {
  'use strict';

  if (!window.google || !google.script || !google.script.run) return;

  var config = window.__HSC_CONFIG__ || {};
  var comments = [];
  var anchors = {};
  var current = null;
  var showAll = true;
  var pendingLocation = null;
  var submitting = false;
  var storageKey = 'hsc-reviewer-v2:' + String(config.reportId || 'default');
  var reviewerState = loadReviewerState();
  var identityState = { displayName: reviewerState.displayName, needsDisplayName: !reviewerState.displayName };
  var icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"></path></svg>';

  function makeReviewerToken() {
    var bytes = new Uint8Array(24);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    var binary = '';
    for (var j = 0; j < bytes.length; j += 1) binary += String.fromCharCode(bytes[j]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function loadReviewerState() {
    var fallback = { reviewerToken: makeReviewerToken(), displayName: '' };
    try {
      var stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (stored && /^[A-Za-z0-9_-]{24,128}$/.test(String(stored.reviewerToken || ''))) {
        return { reviewerToken: String(stored.reviewerToken), displayName: String(stored.displayName || '').slice(0, 40) };
      }
      window.localStorage.setItem(storageKey, JSON.stringify(fallback));
    } catch (error) { /* Continue with an in-memory identity when storage is unavailable. */ }
    return fallback;
  }

  function saveReviewerState(displayName) {
    reviewerState.displayName = String(displayName || '').slice(0, 40);
    try { window.localStorage.setItem(storageKey, JSON.stringify(reviewerState)); }
    catch (error) { /* The current page still retains the identity in memory. */ }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function slug(value) {
    var normalized = String(value || '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return normalized || 'section';
  }

  function headingFor(target) {
    if (/^H[1-6]$/.test(target.tagName)) return target;
    return target.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
  }

  function headingPath(target, label) {
    var heading = headingFor(target);
    if (!heading) return label;
    var headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    var stack = [];
    for (var i = 0; i < headings.length; i += 1) {
      var item = headings[i];
      var level = Number(item.tagName.slice(1));
      stack = stack.slice(0, level - 1);
      stack[level - 1] = item.textContent.trim();
      if (item === heading || target.contains(item)) break;
    }
    var path = stack.filter(Boolean);
    if (!path.length || path[path.length - 1] !== label) path.push(label);
    return path.join(' ＞ ').slice(0, 500);
  }

  function snapshotFor(target) {
    var clone = target.cloneNode(true);
    clone.querySelectorAll('.hsc-trigger,.hsc-drawer,.hsc-backdrop,script,style').forEach(function (node) { node.remove(); });
    return clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function candidateTargets() {
    var explicit = Array.prototype.slice.call(document.querySelectorAll('[data-comment-anchor],[data-comment-section]'));
    if (explicit.length) return explicit;
    var withIds = Array.prototype.slice.call(document.querySelectorAll('main section[id],main article[id],section[id],article[id]'));
    if (withIds.length) return withIds;
    var structured = Array.prototype.slice.call(document.querySelectorAll('main > section,main > article'));
    if (structured.length) return structured;
    return Array.prototype.slice.call(document.querySelectorAll('h2,h3'));
  }

  function makeTrigger(anchor, floating) {
    var button = el('button', 'hsc-trigger' + (floating ? ' hsc-floating' : ''));
    button.type = 'button';
    button.innerHTML = icon + '<span>コメント</span><span class="hsc-count">0</span>';
    button.setAttribute('aria-label', anchor.label + 'のコメントを開く');
    button.dataset.hscOpen = anchor.id;
    button.addEventListener('click', function () { openDrawer(anchor, floating); });
    return button;
  }

  candidateTargets().forEach(function (target, index) {
    var heading = headingFor(target);
    var label = target.dataset.commentTitle || target.getAttribute('aria-label') || (heading && heading.textContent.trim()) || ('セクション ' + (index + 1));
    var baseId = target.dataset.commentAnchor || target.dataset.commentSection || target.id || slug(label);
    var id = baseId;
    var suffix = 2;
    while (anchors[id]) { id = baseId + '-' + suffix; suffix += 1; }
    var anchor = { id: id, label: label.slice(0, 200), path: headingPath(target, label), quote: snapshotFor(target), target: target };
    anchors[id] = anchor;
    target.dataset.hscAnchor = id;
    var mount = heading || target;
    mount.appendChild(makeTrigger(anchor, false));
  });

  var overall = { id: 'report-overall', label: 'ページ全体', path: 'ページ全体', quote: document.title || config.title || 'HTML', target: document.body };
  anchors[overall.id] = overall;
  var floating = makeTrigger(overall, true);
  document.body.appendChild(floating);

  var backdrop = el('div', 'hsc-backdrop');
  var drawer = el('aside', 'hsc-drawer');
  drawer.setAttribute('aria-label', 'レビューコメント');
  var header = el('header', 'hsc-header');
  var headerCopy = el('div');
  headerCopy.appendChild(el('p', 'hsc-eyebrow', 'REVIEW COMMENTS'));
  var title = el('h2', 'hsc-title', 'コメント');
  headerCopy.appendChild(title);
  var close = el('button', 'hsc-close', '×');
  close.type = 'button'; close.setAttribute('aria-label', '閉じる');
  var identity = el('p', 'hsc-identity', '投稿者情報を読み込んでいます…');
  header.appendChild(headerCopy); header.appendChild(close); header.appendChild(identity);
  var list = el('div', 'hsc-list');
  var form = el('form', 'hsc-form');
  var profile = el('div', 'hsc-profile');
  profile.hidden = true;
  var displayNameLabel = el('label', '', '表示名');
  displayNameLabel.setAttribute('for', 'hsc-display-name');
  var displayNameInput = el('input');
  displayNameInput.id = 'hsc-display-name';
  displayNameInput.type = 'text';
  displayNameInput.maxLength = 40;
  displayNameInput.autocomplete = 'nickname';
  displayNameInput.placeholder = '例：山田 太郎';
  var displayNameHelp = el('p', 'hsc-help', 'この端末に保存され、次回から自動で使われます。メールアドレスは入力できません。');
  profile.appendChild(displayNameLabel); profile.appendChild(displayNameInput); profile.appendChild(displayNameHelp);
  var label = el('label', '', 'コメントを追加');
  var textarea = el('textarea'); textarea.maxLength = Number(config.maxLength || 1000); textarea.placeholder = '確認事項や修正してほしい内容を入力';
  var error = el('p', 'hsc-error');
  var footer = el('div', 'hsc-form-footer');
  var meta = el('div');
  var count = el('span', '', '0 / ' + textarea.maxLength);
  meta.appendChild(count);
  var submit = el('button', 'hsc-submit', '投稿する'); submit.type = 'submit';
  footer.appendChild(meta); footer.appendChild(submit);
  form.appendChild(profile); form.appendChild(label); form.appendChild(textarea); form.appendChild(error); form.appendChild(footer);
  drawer.appendChild(header); drawer.appendChild(list); drawer.appendChild(form);
  document.body.appendChild(backdrop); document.body.appendChild(drawer);

  function failureMessage(failure) {
    var message = failure && failure.message ? String(failure.message) : String(failure || '');
    var allowed = [
      'Apps Scriptエディタから、デプロイ所有者のアカウントで実行してください。',
      '投稿者情報を保存できませんでした。ページを再読み込みして再度お試しください。',
      '表示名を入力してください。',
      '表示名は40文字以内にしてください。',
      'メールアドレスを含まない表示名を入力してください。',
      '投稿が続いています。少し待ってから再度お試しください。',
      '投稿が集中しています。少し待ってから再度お試しください。',
      'コメントを入力してください。',
      'コメントは' + Number(config.maxLength || 1000) + '文字以内にしてください。'
    ];
    for (var i = 0; i < allowed.length; i += 1) {
      if (message.indexOf(allowed[i]) !== -1) return allowed[i];
    }
    return 'コメント処理でエラーが発生しました。時間をおいて再度お試しください。';
  }
  function showError(message) { error.textContent = message; error.classList.add('hsc-visible'); }
  function hideError() { error.textContent = ''; error.classList.remove('hsc-visible'); }
  function closeDrawer() { backdrop.classList.remove('hsc-open'); drawer.classList.remove('hsc-open'); }
  function openDrawer(anchor, all) {
    current = anchor; showAll = Boolean(all);
    title.textContent = showAll ? 'すべてのコメント' : anchor.label;
    label.textContent = anchor.label + 'へのコメント';
    render(); backdrop.classList.add('hsc-open'); drawer.classList.add('hsc-open');
    window.setTimeout(function () { textarea.focus(); }, 180);
  }
  function focusAnchor(anchorId) {
    var anchor = anchors[anchorId];
    if (!anchor || !anchor.target) return;
    anchor.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    anchor.target.classList.remove('hsc-target-focus');
    window.setTimeout(function () { anchor.target.classList.add('hsc-target-focus'); }, 20);
  }
  function render() {
    var visible = showAll ? comments : comments.filter(function (item) { return item.anchorId === current.id; });
    list.replaceChildren();
    if (!visible.length) { list.appendChild(el('p', 'hsc-empty', 'まだコメントはありません。\n最初の確認事項を残せます。')); return; }
    visible.forEach(function (item) {
      var card = el('article', 'hsc-card'); card.dataset.hscCommentId = item.id;
      var cardMeta = el('div', 'hsc-meta'); cardMeta.appendChild(el('strong', '', item.authorDisplayName || '既存レビュアー')); cardMeta.appendChild(el('time', '', item.createdAt)); card.appendChild(cardMeta);
      var path = el('button', 'hsc-path', item.anchorPath || item.anchorLabel); path.type = 'button'; path.addEventListener('click', function () { focusAnchor(item.anchorId); }); card.appendChild(path);
      card.appendChild(el('p', 'hsc-body', item.body)); card.appendChild(el('span', 'hsc-status', item.status || '未対応')); list.appendChild(card);
    });
    if (pendingLocation && pendingLocation.comment) {
      var focused = list.querySelector('[data-hsc-comment-id="' + CSS.escape(pendingLocation.comment) + '"]');
      if (focused) { focused.classList.add('hsc-focus'); focused.scrollIntoView({ block: 'center' }); }
      pendingLocation = null;
    }
  }
  function updateCounts() {
    var counts = {};
    comments.forEach(function (item) { counts[item.anchorId] = (counts[item.anchorId] || 0) + 1; });
    document.querySelectorAll('[data-hsc-open]').forEach(function (button) {
      button.querySelector('.hsc-count').textContent = button === floating ? String(comments.length) : String(counts[button.dataset.hscOpen] || 0);
    });
  }

  textarea.addEventListener('input', function () { count.textContent = textarea.value.length + ' / ' + textarea.maxLength; hideError(); });
  displayNameInput.addEventListener('input', hideError);
  backdrop.addEventListener('click', closeDrawer); close.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDrawer(); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var body = textarea.value.trim();
    if (!body) { showError('コメントを入力してください。'); return; }
    var requestedDisplayName = displayNameInput.value.trim();
    if (identityState.needsDisplayName && !requestedDisplayName) { showError('表示名を入力してください。'); displayNameInput.focus(); return; }
    if (submitting || !current) return;
    submitting = true; submit.disabled = true; submit.textContent = '投稿中…'; hideError();
    google.script.run.withSuccessHandler(function (created) {
      comments.unshift(created);
      identityState = { displayName: created.authorDisplayName || '', needsDisplayName: false };
      saveReviewerState(identityState.displayName);
      identity.textContent = '投稿者：' + identityState.displayName;
      profile.hidden = true;
      displayNameInput.value = '';
      textarea.value = ''; count.textContent = '0 / ' + textarea.maxLength; submitting = false; submit.disabled = false; submit.textContent = '投稿する'; updateCounts(); render();
    }).withFailureHandler(function (failure) {
      submitting = false; submit.disabled = false; submit.textContent = '投稿する'; showError(failureMessage(failure));
    }).addComment({ anchorId: current.id, anchorLabel: current.label, anchorPath: current.path, quoteSnapshot: current.quote, body: body, displayName: identityState.needsDisplayName ? requestedDisplayName : '', reviewerToken: reviewerState.reviewerToken });
  });

  function loadLocation(callback) {
    if (!google.script.url || !google.script.url.getLocation) { callback(); return; }
    google.script.url.getLocation(function (location) {
      pendingLocation = { anchor: location.parameter.anchor || '', comment: location.parameter.comment || '' };
      callback();
    });
  }

  loadLocation(function () {
    google.script.run.withSuccessHandler(function (state) {
      comments = Array.isArray(state.comments) ? state.comments : [];
      identityState = state.identity || { displayName: '', needsDisplayName: true };
      if (identityState.displayName) saveReviewerState(identityState.displayName);
      profile.hidden = !identityState.needsDisplayName;
      displayNameInput.value = identityState.needsDisplayName ? reviewerState.displayName : '';
      identity.textContent = identityState.displayName ? '投稿者：' + identityState.displayName : '初回投稿時に表示名を入力します';
      updateCounts();
      if (pendingLocation && pendingLocation.anchor && anchors[pendingLocation.anchor]) { focusAnchor(pendingLocation.anchor); openDrawer(anchors[pendingLocation.anchor], false); }
      else render();
    }).withFailureHandler(function (failure) {
      identity.textContent = 'コメント機能を利用できません'; list.replaceChildren(el('p', 'hsc-empty', failureMessage(failure))); textarea.disabled = true; submit.disabled = true;
    }).getCommentState({ reviewerToken: reviewerState.reviewerToken });
  });
})();
