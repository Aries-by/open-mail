const loginView = document.getElementById('login-view');
const workspaceView = document.getElementById('workspace-view');
const loginForm = document.getElementById('login-form');
const loginSubmit = document.getElementById('login-submit');
const loginStatus = document.getElementById('login-status');
const providerChips = document.getElementById('provider-chips');
const messageList = document.getElementById('message-list');
const messageTemplate = document.getElementById('message-template');
const refreshButton = document.getElementById('refresh-btn');
const logoutButton = document.getElementById('logout-btn');
const searchInput = document.getElementById('search-input');
const pageSizeOptions = document.getElementById('page-size');
const prevPageButton = document.getElementById('prev-page');
const nextPageButton = document.getElementById('next-page');
const backToListButton = document.getElementById('back-to-list');
const deleteMessageButton = document.getElementById('delete-message');
const deleteSelectedButton = document.getElementById('delete-selected');
const selectAllCheckbox = document.getElementById('select-all');
const listAlert = document.getElementById('list-alert');
const pageSummary = document.getElementById('page-summary');
const pageIndicatorMain = document.getElementById('page-indicator-main');
const jumpPageInput = document.getElementById('jump-page-input');
const jumpPageButton = document.getElementById('jump-page-btn');
const accountEmail = document.getElementById('account-email');
const accountProvider = document.getElementById('account-provider');
const accountStatusDot = document.getElementById('account-status-dot');
const accountHost = document.getElementById('account-host');
const accountPort = document.getElementById('account-port');
const translateLatency = document.getElementById('translate-latency');
const totalCount = document.getElementById('total-count');
const pageIndicator = document.getElementById('page-indicator');
const workspaceStatus = document.getElementById('workspace-status');
const detailSubject = document.getElementById('detail-subject');
const detailFolder = document.getElementById('detail-folder');
const detailDate = document.getElementById('detail-date');
const detailMeta = document.getElementById('detail-meta');
const translationBar = document.getElementById('translation-bar');
const translationStatus = document.getElementById('translation-status');
const translateMessageButton = document.getElementById('translate-message');
const showOriginalButton = document.getElementById('show-original');
const showTranslatedButton = document.getElementById('show-translated');
const detailBody = document.getElementById('detail-body');
const listView = document.getElementById('list-view');
const detailView = document.getElementById('detail-view');

const CREDENTIALS_KEY = 'open-mail-remembered-credentials';
const SESSION_KEY = 'open-mail-session';
const AUTO_REFRESH_INTERVAL_MS = 10 * 1000;
const MICROSOFT_TRANSLATE_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MICROSOFT_TRANSLATE_URL = 'https://api-edge.cognitive.microsofttranslator.com/translate';

const state = {
  providers: [],
  isAuthenticated: false,
  account: null,
  messages: [],
  selectedMessageId: null,
  selectedMessage: null,
  selectedMessageIds: [],
  focusedMessageIndex: 0,
  selectionAnchorIndex: null,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  totalMessages: 0,
  query: '',
  mailView: 'list',
  autoRefreshTimer: null,
  countdownTimer: null,
  nextRefreshAt: null,
  isLoadingMessages: false,
  currentDetail: null,
  originalEmailHtml: '',
  translatedEmailHtml: '',
  isTranslatedView: false,
  translationVersion: 0,
  translateToken: null,
  translateTokenTime: 0,
  translateLatencyMs: null,
  refreshStatusBase: '登录后可查看最新邮件。',
  lastStatusText: '登录后可查看最新邮件。'
};

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function extractPrimaryName(value) {
  const firstPart = String(value || '').split(',')[0].trim();
  const match = firstPart.match(/^(.*?)\s*<.*>$/);
  if (match) {
    return match[1].trim() || firstPart.replace(/<.*>$/, '').trim();
  }
  return firstPart.replace(/<.*>$/, '').trim() || '未知发件人';
}

function formatDate(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function formatBytes(size) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeEmailHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, form, meta, link, base, title').forEach((node) => node.remove());

  doc.body.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();

      if (name.startsWith('on') || name === 'srcdoc') {
        node.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'href' || name === 'src') && /^(javascript|vbscript):/.test(value)) {
        node.removeAttribute(attr.name);
      }
    }

    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });

  return doc.body.innerHTML;
}

function removeLeadingSubjectText(html) {
  const subject = detailSubject.textContent.trim();
  if (!subject) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const firstNode = Array.from(doc.body.childNodes).find((node) => String(node.textContent || '').trim());
  if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) return html;

  if (firstNode.textContent.trim() === subject) {
    firstNode.remove();
  }

  return doc.body.innerHTML;
}

function buildEmailDocument(html) {
  const bodyHtml = removeLeadingSubjectText(sanitizeEmailHtml(html));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base target="_blank">
  <style>
    html, body { margin: 0; min-width: 0; background: #fff; color: #111827; }
    body {
      box-sizing: border-box;
      width: 100%;
      padding: 18px 20px;
      overflow-x: hidden;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    * { box-sizing: border-box; }
    a { overflow-wrap: anywhere; word-break: break-word; }
    img, table { max-width: 100%; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function renderEmailHtml(html) {
  detailBody.className = 'detail-body detail-body-frame-wrap';
  detailBody.innerHTML = '';

  const frame = document.createElement('iframe');
  frame.className = 'detail-body-frame';
  frame.title = '邮件正文原始视图';
  frame.sandbox = 'allow-popups allow-popups-to-escape-sandbox allow-same-origin';
  frame.referrerPolicy = 'no-referrer';
  frame.srcdoc = buildEmailDocument(html);
  frame.addEventListener('load', () => {
    const frameBody = frame.contentDocument?.body;
    if (frameBody) {
      frame.style.height = `${Math.max(frameBody.scrollHeight, 520)}px`;
    }
  });

  detailBody.appendChild(frame);
}

function setTranslationVisible(visible) {
  translationBar.hidden = !visible;
}

function setTranslationStatus(text, tone = 'normal') {
  translationStatus.textContent = text;
  translationBar.dataset.tone = tone;
}

function resetTranslationState() {
  state.translationVersion += 1;
  state.currentDetail = null;
  state.originalEmailHtml = '';
  state.translatedEmailHtml = '';
  state.isTranslatedView = false;
  translateMessageButton.disabled = false;
  showOriginalButton.disabled = true;
  showTranslatedButton.disabled = true;
  setTranslationStatus('检测语言中...');
  setTranslationVisible(false);
}

function setTranslateLatency(ms) {
  state.translateLatencyMs = typeof ms === 'number' ? ms : null;
  if (!translateLatency) return;

  if (state.translateLatencyMs == null) {
    translateLatency.textContent = '-- ms';
    translateLatency.className = 'latency-value';
    return;
  }

  translateLatency.textContent = `${state.translateLatencyMs} ms`;
  translateLatency.className = 'latency-value';
  if (state.translateLatencyMs <= 500) {
    translateLatency.classList.add('latency-good');
  } else if (state.translateLatencyMs <= 1200) {
    translateLatency.classList.add('latency-warn');
  } else {
    translateLatency.classList.add('latency-bad');
  }
}

function shouldOfferTranslation(texts) {
  const sample = (Array.isArray(texts) ? texts.join(' ') : String(texts || '')).slice(0, 1600);
  if (sample.length < 20) return false;

  const chineseChars = (sample.match(/[\u3400-\u9FFF]/g) || []).length;
  const letters = (sample.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  return letters >= 12 && chineseChars / Math.max(sample.length, 1) < 0.18;
}

function getTranslatableTextNodes(root) {
  const excludedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'TITLE']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2 || !/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || excludedTags.has(parent.tagName) || parent.closest('[translate="no"]')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (nodes.length < 500) {
    const node = walker.nextNode();
    if (!node) break;
    nodes.push(node);
  }
  return nodes;
}

async function requestTranslation(texts) {
  const version = state.translationVersion;
  const chunks = texts
    .map((text) => String(text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => text.slice(0, 1800));

  const translations = [];
  for (let index = 0; index < chunks.length; index += 20) {
    if (version !== state.translationVersion) return [];
    const batch = chunks.slice(index, index + 20);
    setTranslationStatus(`正在翻译 ${Math.min(index + batch.length, chunks.length)} / ${chunks.length} 段...`, 'loading');

    const translatedBatch = await requestTranslationBatch(batch);
    if (version !== state.translationVersion) return [];
    translations.push(...translatedBatch);
  }

  return translations;
}

async function requestTranslationBatch(chunks) {
  try {
    const result = await apiFetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: chunks, targetLang: 'zh-Hans' })
    });
    return result.translations || [];
  } catch (error) {
    if (!/404|翻译失败|请求失败/.test(String(error.message || ''))) {
      throw error;
    }
    return requestMicrosoftTranslationDirect(chunks);
  }
}

async function getMicrosoftTranslateTokenDirect(forceRefresh = false) {
  const tokenAge = Date.now() - state.translateTokenTime;
  if (state.translateToken && !forceRefresh && tokenAge < 8 * 60 * 1000) {
    return state.translateToken;
  }

  const startedAt = performance.now();
  const response = await fetch(MICROSOFT_TRANSLATE_AUTH_URL);
  setTranslateLatency(Math.max(1, Math.round(performance.now() - startedAt)));
  if (!response.ok) {
    throw new Error(`微软翻译授权失败：${response.status}`);
  }

  state.translateToken = await response.text();
  state.translateTokenTime = Date.now();
  return state.translateToken;
}

async function refreshTranslateLatency() {
  try {
    await getMicrosoftTranslateTokenDirect(true);
  } catch {
    setTranslateLatency(null);
  }
}

async function requestMicrosoftTranslationDirect(chunks, forceRefresh = false) {
  const token = await getMicrosoftTranslateTokenDirect(forceRefresh);
  const params = new URLSearchParams({ to: 'zh-Hans', 'api-version': '3.0' });
  const response = await fetch(`${MICROSOFT_TRANSLATE_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(chunks.map((text) => ({ Text: text })))
  });

  if ((response.status === 401 || response.status === 403) && !forceRefresh) {
    return requestMicrosoftTranslationDirect(chunks, true);
  }

  if (!response.ok) {
    throw new Error(`微软翻译失败：${response.status}`);
  }

  const result = await response.json();
  return result.map((item) => item?.translations?.[0]?.text || '');
}

async function translateCurrentMessage() {
  if (!state.currentDetail || !state.originalEmailHtml) return;

  const version = state.translationVersion;
  translateMessageButton.disabled = true;
  setTranslationStatus('正在按原邮件排版逐段翻译...', 'loading');

  try {
    const doc = new DOMParser().parseFromString(sanitizeEmailHtml(state.originalEmailHtml), 'text/html');
    const nodes = getTranslatableTextNodes(doc.body);
    const entries = nodes
      .map((node) => ({ node, text: String(node.nodeValue || '').replace(/\s+/g, ' ').trim() }))
      .filter((entry) => entry.text);
    const translations = await requestTranslation(entries.map((entry) => entry.text));
    if (version !== state.translationVersion) return;
    if (!translations.length) {
      throw new Error('翻译结果为空');
    }

    entries.forEach((entry, index) => {
      if (translations[index]) {
        entry.node.nodeValue = translations[index];
      }
    });

    state.translatedEmailHtml = doc.body.innerHTML;
    state.isTranslatedView = true;
    renderEmailHtml(state.translatedEmailHtml);
    showOriginalButton.disabled = false;
    showTranslatedButton.disabled = true;
    setTranslationStatus(`已按原件排版翻译 ${translations.filter(Boolean).length} / ${entries.length} 段`, 'success');
  } catch (error) {
    translateMessageButton.disabled = false;
    setTranslationStatus(error.message || '翻译失败，请稍后重试', 'error');
  }
}

function prepareTranslation(detail) {
  resetTranslationState();
  state.currentDetail = detail;
  state.originalEmailHtml = detail.html || '';

  const doc = new DOMParser().parseFromString(sanitizeEmailHtml(state.originalEmailHtml), 'text/html');
  const texts = getTranslatableTextNodes(doc.body).map((node) => node.nodeValue);
  if (!shouldOfferTranslation(texts)) {
    return;
  }

  setTranslationVisible(true);
  setTranslationStatus('检测到非中文邮件，将保留原件排版翻译。');
  void translateCurrentMessage();
}

function setView(view) {
  const loginActive = view === 'login';
  document.documentElement.dataset.route = loginActive ? 'login' : 'mail';
  loginView.classList.toggle('view-active', loginActive);
  workspaceView.classList.toggle('view-active', !loginActive);
}

function navigateToPage(path, replace = false) {
  if (`${window.location.pathname}${window.location.search}` === path) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', path);
}

function showLoginPage(replace = false) {
  navigateToPage('/login', replace);
  setView('login');
}

function buildMailPath() {
  const params = new URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.query) params.set('query', state.query);
  const query = params.toString();
  return query ? `/mail?${query}` : '/mail';
}

function buildReadPath(message) {
  const params = new URLSearchParams({
    uid: String(message.uid),
    mailbox: message.mailbox,
    folderType: message.folderType,
    id: message.id
  });
  if (state.page > 1) params.set('page', String(state.page));
  if (state.query) params.set('query', state.query);
  return `/mail/read?${params.toString()}`;
}

function showMailPage(replace = false) {
  navigateToPage(buildMailPath(), replace);
  setView('workspace');
}

function showReadPage(message, replace = false) {
  navigateToPage(buildReadPath(message), replace);
  setView('workspace');
}

function readRouteState() {
  const params = new URLSearchParams(window.location.search);
  return {
    page: Math.max(Number(params.get('page')) || 1, 1),
    query: String(params.get('query') || '').trim(),
    uid: params.get('uid'),
    mailbox: params.get('mailbox'),
    folderType: params.get('folderType') || 'inbox',
    id: params.get('id')
  };
}

function isMailRoute() {
  return window.location.pathname === '/mail' || window.location.pathname === '/mail/read';
}

function applyRouteState() {
  const route = readRouteState();
  state.page = route.page;
  state.query = route.query;
  searchInput.value = route.query;
  return route;
}

function findMessageFromRoute(route) {
  return state.messages.find((message) => {
    if (route.id && message.id === route.id) return true;
    return route.uid
      && route.mailbox
      && String(message.uid) === String(route.uid)
      && message.mailbox === route.mailbox;
  });
}

function createMessageFromRoute(route) {
  if (!route.uid || !route.mailbox) return null;

  return {
    id: route.id || `${route.mailbox}:${route.uid}`,
    uid: route.uid,
    mailbox: route.mailbox,
    folderType: route.folderType || 'inbox',
    subject: '(正在读取邮件)',
    senderName: '',
    from: '',
    to: '',
    date: null
  };
}

function setMailView(view) {
  state.mailView = view;
  listView.classList.toggle('content-view-active', view === 'list');
  detailView.classList.toggle('content-view-active', view === 'detail');
}

function setLoginStatus(text, error = false) {
  loginStatus.textContent = text;
  loginStatus.classList.toggle('error-text', error);
}

function setWorkspaceStatus(text) {
  state.lastStatusText = text;
  workspaceStatus.textContent = text;
}

function setWorkspaceStatusBase(text) {
  state.refreshStatusBase = text;
  state.lastStatusText = text;
  workspaceStatus.textContent = text;
}

function showListAlert(text, tone = 'error') {
  listAlert.hidden = false;
  listAlert.textContent = text;
  listAlert.className = `list-alert list-alert-${tone}`;
}

function hideListAlert() {
  listAlert.hidden = true;
  listAlert.textContent = '';
  listAlert.className = 'list-alert';
}

function setRefreshStatus(text = state.lastStatusText) {
  state.refreshStatusBase = text;
  state.lastStatusText = text;
  const remainingSeconds = state.nextRefreshAt
    ? Math.max(0, Math.ceil((state.nextRefreshAt.getTime() - Date.now()) / 1000))
    : 10;
  const suffix = state.isAuthenticated
    ? ` · 自动刷新 ${remainingSeconds}s`
    : '';
  workspaceStatus.textContent = `${state.refreshStatusBase}${suffix}`;
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  state.nextRefreshAt = null;
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!state.isAuthenticated || document.hidden) return;

  state.nextRefreshAt = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS);
  setRefreshStatus();
  state.countdownTimer = window.setInterval(() => {
    setRefreshStatus(state.refreshStatusBase);
  }, 1000);

  state.autoRefreshTimer = window.setInterval(() => {
    if (!state.isAuthenticated || document.hidden || state.isLoadingMessages) return;
    if (state.page !== 1 || state.query) return;
    state.nextRefreshAt = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS);
    void loadMessages(true, { silent: true, keepView: true, updateRoute: false });
  }, AUTO_REFRESH_INTERVAL_MS);
}

async function refreshMessagesNow(resetPage = false, options = {}) {
  stopAutoRefresh();
  try {
    await loadMessages(resetPage, options);
  } finally {
    startAutoRefresh();
  }
}

function saveSession(account) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(account));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function resetWorkspaceState(redirectToLogin = true) {
  state.isAuthenticated = false;
  state.account = null;
  state.messages = [];
  state.selectedMessageId = null;
  state.selectedMessage = null;
  state.selectedMessageIds = [];
  state.page = 1;
  state.totalPages = 1;
  state.totalMessages = 0;
  state.query = '';
  state.mailView = 'list';

  searchInput.value = '';
  messageList.className = 'message-table empty-state';
  messageList.textContent = '登录后开始载入邮件。';
  totalCount.textContent = '0';
  accountEmail.textContent = '未登录';
  accountProvider.textContent = '-';
  accountHost.textContent = 'imap.qq.com';
  accountPort.textContent = '993 / SSL';
  setTranslateLatency(null);
  accountStatusDot.className = 'account-status-dot account-status-offline';
  setWorkspaceStatusBase('登录后可查看最新邮件。');
  updatePaginationButtons();
  updateSelectionUI();
  resetDetail();
  setMailView('list');
  if (redirectToLogin) {
    showLoginPage(true);
  }
}

function rememberCredentials(payload) {
  const { password: _password, ...safePayload } = payload;
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(safePayload));
}

function clearRememberedCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY);
}

function restoreRememberedCredentials() {
  const raw = localStorage.getItem(CREDENTIALS_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    document.getElementById('host').value = saved.host || 'imap.qq.com';
    document.getElementById('port').value = saved.port || 993;
    document.getElementById('email').value = saved.email || '';
    document.getElementById('password').value = '';
    document.getElementById('secure').checked = saved.secure !== false;
    document.getElementById('remember').checked = true;
    return saved;
  } catch {
    clearRememberedCredentials();
    return null;
  }
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});

  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '请求失败');
  }
  return result;
}

function renderProviderChips() {
  providerChips.innerHTML = '';
  for (const provider of state.providers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'provider-chip';
    button.textContent = provider.label;
    button.addEventListener('click', () => {
      document.getElementById('host').value = provider.host;
      document.getElementById('port').value = provider.port;
      document.getElementById('secure').checked = provider.secure;
    });
    providerChips.appendChild(button);
  }
}

function setAccountInfo(account) {
  accountEmail.textContent = '正在同步当前账号...';
  accountProvider.textContent = account.provider;
  accountHost.textContent = account.host;
  accountPort.textContent = `${account.port} / ${account.secure ? 'SSL' : 'Plain'}`;
  accountStatusDot.className = 'account-status-dot account-status-pending';

  window.setTimeout(() => {
    accountEmail.textContent = account.email;
    accountStatusDot.className = 'account-status-dot account-status-online';
  }, 180);
}

function resetDetail() {
  resetTranslationState();
  detailSubject.textContent = '选择一封邮件查看正文';
  detailFolder.textContent = '-';
  detailDate.textContent = '-';
  deleteMessageButton.disabled = true;
  detailMeta.className = 'detail-meta empty-meta';
  detailMeta.textContent = '这里会显示发件人、收件人、时间、附件信息。';
  detailBody.className = 'detail-body empty-state detail-empty';
  detailBody.textContent = '从左侧列表点击一封邮件，这里会进入邮件阅读页。';
}

function updatePaginationButtons() {
  prevPageButton.disabled = state.page <= 1;
  nextPageButton.disabled = state.page >= state.totalPages;
  pageIndicator.textContent = `${state.page} / ${state.totalPages}`;
  pageIndicatorMain.textContent = `第 ${state.page} / ${state.totalPages} 页`;
  jumpPageInput.max = String(Math.max(state.totalPages, 1));
  jumpPageInput.value = String(state.page);

  const start = state.totalMessages ? (state.page - 1) * state.pageSize + 1 : 0;
  const end = state.totalMessages ? Math.min(state.page * state.pageSize, state.totalMessages) : 0;
  pageSummary.textContent = `第 ${start} - ${end} 封，共 ${state.totalMessages} 封`;
}

function updatePageSizeUI() {
  pageSizeOptions.querySelectorAll('.page-size-option').forEach((button) => {
    button.classList.toggle('page-size-option-active', Number(button.dataset.size) === state.pageSize);
  });
}

function updateSelectionUI() {
  const currentPageIds = state.messages.map((message) => message.id);
  const selectedOnPage = currentPageIds.filter((id) => state.selectedMessageIds.includes(id));
  selectAllCheckbox.checked = !!currentPageIds.length && selectedOnPage.length === currentPageIds.length;
  selectAllCheckbox.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < currentPageIds.length;
  deleteSelectedButton.disabled = state.selectedMessageIds.length === 0;
}

function clampFocusedIndex(index) {
  if (!state.messages.length) return 0;
  return Math.min(Math.max(index, 0), state.messages.length - 1);
}

function selectRange(fromIndex, toIndex, checked = true) {
  if (!state.messages.length) return;

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  const ids = state.messages.slice(start, end + 1).map((message) => message.id);

  if (checked) {
    state.selectedMessageIds = Array.from(new Set([...state.selectedMessageIds, ...ids]));
  } else {
    state.selectedMessageIds = state.selectedMessageIds.filter((id) => !ids.includes(id));
  }
  updateSelectionUI();
}

function toggleSelection(messageId, checked) {
  const exists = state.selectedMessageIds.includes(messageId);
  if (checked && !exists) {
    state.selectedMessageIds.push(messageId);
  }
  if (!checked && exists) {
    state.selectedMessageIds = state.selectedMessageIds.filter((id) => id !== messageId);
  }
  updateSelectionUI();
}

function focusMessageAt(index) {
  state.focusedMessageIndex = clampFocusedIndex(index);
  renderMessages();
  const focused = messageList.querySelector(`[data-index="${state.focusedMessageIndex}"]`);
  focused?.focus({ preventScroll: true });
  focused?.scrollIntoView({ block: 'nearest' });
}

function renderMessages() {
  if (!state.messages.length) {
    messageList.className = 'message-table empty-state';
    messageList.textContent = '当前没有匹配邮件，试试翻页或缩短搜索条件。';
    updateSelectionUI();
    return;
  }

  messageList.className = 'message-table';
  messageList.innerHTML = '';

  state.focusedMessageIndex = clampFocusedIndex(state.focusedMessageIndex);

  for (const [index, message] of state.messages.entries()) {
    const row = messageTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = message.id;
    row.dataset.index = String(index);
    row.tabIndex = 0;
    row.classList.toggle('message-row-active', state.selectedMessageId === message.id);
    row.classList.toggle('message-row-focused', state.focusedMessageIndex === index);

    const checkbox = row.querySelector('.message-checkbox');
    const mailDot = row.querySelector('.message-row-mail-dot');
    checkbox.checked = state.selectedMessageIds.includes(message.id);

    row.querySelector('.message-row-sender').textContent = extractPrimaryName(message.senderName || message.from || '未知发件人');
    row.querySelector('.message-row-subject').textContent = message.subject || '(无主题)';
    row.querySelector('.message-row-preview').textContent = message.preview ? ` - ${message.preview}` : '';
    row.querySelector('.message-row-date').textContent = formatDate(message.date);
    mailDot.className = message.folderType === 'spam'
      ? 'message-row-mail-dot message-row-mail-dot-spam'
      : 'message-row-mail-dot message-row-mail-dot-normal';

    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.shiftKey && state.selectionAnchorIndex !== null) {
        selectRange(state.selectionAnchorIndex, index, event.target.checked);
      } else {
        toggleSelection(message.id, event.target.checked);
      }
      state.selectionAnchorIndex = index;
      state.focusedMessageIndex = index;
      renderMessages();
    });

    row.addEventListener('click', async (event) => {
      state.focusedMessageIndex = index;
      if (event.shiftKey && state.selectionAnchorIndex !== null) {
        selectRange(state.selectionAnchorIndex, index, true);
        renderMessages();
        return;
      }
      await selectMessage(message.id, false);
    });

    messageList.appendChild(row);
  }

  updateSelectionUI();
}

async function loadMessageDetail(message) {
  state.selectedMessage = message;
  resetTranslationState();
  detailSubject.textContent = '正在读取邮件正文...';
  detailFolder.textContent = message.folderType === 'spam' ? '垃圾箱' : '收件箱';
  detailDate.textContent = formatDate(message.date);
  deleteMessageButton.disabled = true;
  detailMeta.className = 'detail-meta';
  detailMeta.textContent = '正在从 IMAP 读取完整正文与附件信息。';
  detailBody.className = 'detail-body loading-body';
  detailBody.textContent = '正在载入...';
  setMailView('detail');

  try {
    const detail = await apiFetch(`/api/message-detail?uid=${encodeURIComponent(message.uid)}&mailbox=${encodeURIComponent(message.mailbox)}&folderType=${encodeURIComponent(message.folderType)}&id=${encodeURIComponent(message.id)}`);
    detailSubject.textContent = detail.subject || '(无主题)';
    detailFolder.textContent = detail.folderType === 'spam' ? '垃圾箱' : '收件箱';
    detailDate.textContent = formatDate(detail.date);
    deleteMessageButton.disabled = false;

    const metaLines = [
      `发件人：${detail.from || '未知'}`,
      `收件人：${detail.to || '未知'}`,
      `时间：${formatDate(detail.date)}`
    ];

    if (detail.cc) {
      metaLines.push(`抄送：${detail.cc}`);
    }

    if (detail.attachments.length) {
      metaLines.push(`附件：${detail.attachments.map((item) => `${item.filename} (${formatBytes(item.size)})`).join('，')}`);
    }

    detailMeta.className = 'detail-meta';
    detailMeta.innerHTML = metaLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
    renderEmailHtml(detail.html);
    prepareTranslation(detail);
  } catch (error) {
    resetTranslationState();
    detailMeta.className = 'detail-meta error-text';
    detailMeta.textContent = error.message || '读取详情失败';
    detailBody.className = 'detail-body empty-state detail-empty';
    detailBody.textContent = '这封邮件暂时无法读取，请刷新后重试。';
  }
}

async function selectMessage(messageId, replaceRoute = false) {
  state.selectedMessageId = messageId;
  renderMessages();
  const selected = state.messages.find((message) => message.id === messageId);
  if (selected) {
    state.selectedMessage = selected;
    showReadPage(selected, replaceRoute);
    await loadMessageDetail(selected);
  }
}

async function restoreRouteView(replaceRoute = true) {
  const route = applyRouteState();
  setView('workspace');

  if (window.location.pathname === '/mail/read') {
    setWorkspaceStatusBase('正在恢复邮件阅读页...');
    await refreshMessagesNow(false, { keepView: true, updateRoute: false });
    if (!state.isAuthenticated) return;

    const routeMessage = findMessageFromRoute(route) || createMessageFromRoute(route);
    if (routeMessage) {
      state.selectedMessageId = routeMessage.id;
      state.selectedMessage = routeMessage;
      renderMessages();
      showReadPage(routeMessage, replaceRoute);
      await loadMessageDetail(routeMessage);
      return;
    }

    setMailView('list');
    showMailPage(replaceRoute);
    return;
  }

  showMailPage(replaceRoute);
  await refreshMessagesNow(false, { keepView: false, updateRoute: false });
}

async function loadMessages(resetPage = false, options = {}) {
  if (state.isLoadingMessages) return;

  const silent = Boolean(options.silent);
  const keepView = Boolean(options.keepView ?? silent);
  const updateRoute = options.updateRoute !== false;

  if (resetPage) {
    state.page = 1;
  }

  if (updateRoute && !keepView) {
    showMailPage(true);
  }
  if (!silent) {
    hideListAlert();
  }

  state.isLoadingMessages = true;
  state.selectedMessageIds = [];
  if (!silent) {
    setRefreshStatus('正在刷新邮件列表...');
    messageList.className = 'message-table empty-state';
    messageList.textContent = '正在连接邮箱并读取当前页邮件...';
  }

  try {
    const params = new URLSearchParams({
      page: String(state.page),
      pageSize: String(state.pageSize),
      query: state.query
    });
    const result = await apiFetch(`/api/messages?${params.toString()}`);

    state.messages = result.messages || [];
    state.totalPages = result.totalPages || 1;
    state.totalMessages = result.total || 0;
    totalCount.textContent = String(result.total || 0);
    if (state.selectedMessageId && !state.messages.some((message) => message.id === state.selectedMessageId)) {
      state.selectedMessageId = null;
      state.selectedMessage = null;
      if (!keepView) {
        resetDetail();
      }
    }
    updatePaginationButtons();
    renderMessages();
    if (!keepView) {
      setMailView('list');
      resetDetail();
    }
    if (state.autoRefreshTimer && !document.hidden) {
      state.nextRefreshAt = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS);
    }
    setRefreshStatus(`已加载第 ${result.page} 页，共 ${result.totalPages} 页。`);
  } catch (error) {
    if (error.message.includes('登录已失效')) {
      clearSession();
      stopAutoRefresh();
      await handleLogout(false);
      setLoginStatus('登录会话已失效，请重新登录。', true);
      return;
    }

    setWorkspaceStatusBase(error.message || '加载邮件失败');
    messageList.className = 'message-table empty-state';
    messageList.textContent = '邮件列表加载失败，请检查网络或重新登录。';
    resetDetail();
  } finally {
    state.isLoadingMessages = false;
  }
}

async function handleLogin(credentials, options = {}) {
  loginSubmit.disabled = true;
  setLoginStatus('正在验证 IMAP 登录并创建会话...');

  try {
    const result = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    state.isAuthenticated = true;
    state.account = result;
    saveSession(result);
    if (!options.restoreCurrentRoute) {
      state.page = 1;
      state.totalPages = 1;
      state.totalMessages = 0;
      state.query = '';
      searchInput.value = '';
    }
    setAccountInfo(result);
    if (!options.restoreCurrentRoute) {
      showMailPage();
      setMailView('list');
    }
    setWorkspaceStatusBase('登录成功，正在载入邮件列表...');

    if (credentials.remember) {
      rememberCredentials(credentials);
    } else {
      clearRememberedCredentials();
    }

    if (options.restoreCurrentRoute && isMailRoute()) {
      await restoreRouteView(true);
    } else {
      await refreshMessagesNow(true, { keepView: false });
    }
  } catch (error) {
    setLoginStatus(error.message || '登录失败', true);
  } finally {
    loginSubmit.disabled = false;
  }
}

async function handleLogout(callApi = true) {
  if (callApi && state.isAuthenticated) {
    try {
      await apiFetch('/api/logout', {
        method: 'POST'
      });
    } catch {
      // ignore logout errors
    }
  }

  state.isAuthenticated = false;
  state.account = null;
  stopAutoRefresh();
  clearSession();
  clearRememberedCredentials();
  hideListAlert();
  state.messages = [];
  state.selectedMessageId = null;
  state.selectedMessage = null;
  state.selectedMessageIds = [];
  state.page = 1;
  state.totalPages = 1;
  state.totalMessages = 0;
  state.mailView = 'list';

  accountEmail.textContent = '未登录';
  accountProvider.textContent = '-';
  accountStatusDot.className = 'account-status-dot account-status-offline';
  showLoginPage();
  setMailView('list');
  resetDetail();
}

async function handleDeleteMessage() {
  const selected = state.messages.find((message) => message.id === state.selectedMessageId) || state.selectedMessage;
  if (!selected) return;

  deleteMessageButton.disabled = true;
  try {
    await apiFetch(`/api/message?uid=${encodeURIComponent(selected.uid)}&mailbox=${encodeURIComponent(selected.mailbox)}`, {
      method: 'DELETE'
    });
    setMailView('list');
    state.selectedMessageId = null;
    state.selectedMessage = null;
    state.selectedMessageIds = state.selectedMessageIds.filter((id) => id !== selected.id);
    resetDetail();
    showMailPage(true);
    setWorkspaceStatusBase('邮件已删除，正在刷新列表...');
    await refreshAfterDelete(1);
  } catch (error) {
    deleteMessageButton.disabled = false;
    detailMeta.className = 'detail-meta error-text';
    detailMeta.textContent = error.message || '删除邮件失败';
  } finally {
    updateSelectionUI();
  }
}

async function handleDeleteSelected() {
  const selectedMessages = state.messages.filter((message) => state.selectedMessageIds.includes(message.id));
  if (!selectedMessages.length) return;

  deleteSelectedButton.disabled = true;
  try {
    hideListAlert();
    const result = await apiFetch('/api/messages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: selectedMessages.map((message) => ({
          uid: message.uid,
          mailbox: message.mailbox,
          id: message.id,
          subject: message.subject
        }))
      })
    });

    const failedKeys = new Set((result.failed || []).map((item) => `${item.mailbox}:${item.uid}`));
    const deletedMessages = selectedMessages.filter((message) => !failedKeys.has(`${message.mailbox}:${message.uid}`));
    state.selectedMessageIds = selectedMessages
      .filter((message) => failedKeys.has(`${message.mailbox}:${message.uid}`))
      .map((message) => message.id);

    if (deletedMessages.some((message) => message.id === state.selectedMessageId)) {
      state.selectedMessageId = null;
      state.selectedMessage = null;
      setMailView('list');
      resetDetail();
      showMailPage(true);
    }

    setWorkspaceStatusBase(`已删除 ${result.deleted || deletedMessages.length} 封邮件，正在刷新列表...`);
    await refreshAfterDelete(result.deleted || deletedMessages.length);
    if (result.failed?.length) {
      showListAlert(`已删除 ${result.deleted || deletedMessages.length} 封，失败 ${result.failed.length} 封。失败原因：${result.failed[0].error || '邮箱服务器拒绝删除'}`);
    }
  } catch (error) {
    showListAlert(error.message || '批量删除失败，请稍后重试。');
    setWorkspaceStatusBase('批量删除失败，请查看页面提示。');
    updateSelectionUI();
  } finally {
    deleteSelectedButton.disabled = state.selectedMessageIds.length === 0;
  }
}

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

async function handleListKeyboard(event) {
  if (state.mailView !== 'list' || !state.messages.length || isTypingTarget(event.target)) return;

  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
    event.preventDefault();
    const nextIndex = clampFocusedIndex(state.focusedMessageIndex + 1);
    if (event.shiftKey) {
      if (state.selectionAnchorIndex === null) state.selectionAnchorIndex = state.focusedMessageIndex;
      selectRange(state.selectionAnchorIndex, nextIndex, true);
    } else {
      state.selectionAnchorIndex = nextIndex;
    }
    focusMessageAt(nextIndex);
    return;
  }

  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
    event.preventDefault();
    const nextIndex = clampFocusedIndex(state.focusedMessageIndex - 1);
    if (event.shiftKey) {
      if (state.selectionAnchorIndex === null) state.selectionAnchorIndex = state.focusedMessageIndex;
      selectRange(state.selectionAnchorIndex, nextIndex, true);
    } else {
      state.selectionAnchorIndex = nextIndex;
    }
    focusMessageAt(nextIndex);
    return;
  }

  if (event.key === ' ') {
    event.preventDefault();
    const message = state.messages[state.focusedMessageIndex];
    if (!message) return;
    toggleSelection(message.id, !state.selectedMessageIds.includes(message.id));
    state.selectionAnchorIndex = state.focusedMessageIndex;
    renderMessages();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const message = state.messages[state.focusedMessageIndex];
    if (message) await selectMessage(message.id, false);
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!state.selectedMessageIds.length) return;
    event.preventDefault();
    await handleDeleteSelected();
  }
}

async function jumpToPage() {
  const target = Number(jumpPageInput.value);
  if (!target || target < 1 || target > state.totalPages || target === state.page) {
    jumpPageInput.value = String(state.page);
    return;
  }

  state.page = target;
  await refreshMessagesNow(false, { keepView: false });
}

async function refreshAfterDelete(deletedCount = 1) {
  if (!deletedCount) {
    updateSelectionUI();
    return;
  }

  const remaining = Math.max(0, state.totalMessages - deletedCount);
  const nextTotalPages = Math.max(1, Math.ceil(remaining / state.pageSize));
  if (state.page > nextTotalPages) {
    state.page = nextTotalPages;
  }

  await refreshMessagesNow(false, { keepView: false });
}

const debouncedSearch = debounce(async () => {
  state.query = searchInput.value.trim();
  await refreshMessagesNow(true, { keepView: false });
}, 350);

async function bootstrap() {
  document.documentElement.setAttribute('data-theme', 'light');
  if (window.location.pathname === '/login') {
    setView('login');
  }

  let savedSession = null;
  if (isMailRoute()) {
    try {
      savedSession = await apiFetch('/api/session');
    } catch {
      clearSession();
    }
  }
  const canRestoreMail = Boolean(savedSession && isMailRoute());

  resetWorkspaceState(!canRestoreMail && window.location.pathname !== '/login');
  restoreRememberedCredentials();

  const providerResult = await apiFetch('/api/providers');
  state.providers = providerResult.providers || [];
  renderProviderChips();

  if (!document.getElementById('host').value) {
    const qq = state.providers.find((item) => item.key === 'qq');
    if (qq) {
      document.getElementById('host').value = qq.host;
      document.getElementById('port').value = qq.port;
      document.getElementById('secure').checked = qq.secure;
    }
  }

  updatePageSizeUI();
  void refreshTranslateLatency();

  if (canRestoreMail) {
    state.isAuthenticated = true;
    state.account = savedSession;
    saveSession(savedSession);
    setAccountInfo(savedSession);
    setWorkspaceStatusBase('正在恢复登录状态...');
    messageList.className = 'message-table empty-state';
    messageList.textContent = '正在恢复邮件列表...';
    await restoreRouteView(true);
    return;
  }

  if (window.location.pathname !== '/login') {
    showLoginPage(true);
    return;
  }

  showLoginPage(true);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const credentials = {
    host: String(formData.get('host') || '').trim(),
    port: Number(formData.get('port') || 993),
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
    secure: Boolean(formData.get('secure')),
    remember: Boolean(formData.get('remember'))
  };
  await handleLogin(credentials);
});

refreshButton.addEventListener('click', async () => {
  await refreshMessagesNow(false, { keepView: false });
});

logoutButton.addEventListener('click', async () => {
  await handleLogout(true);
});

searchInput.addEventListener('input', debouncedSearch);

pageSizeOptions.addEventListener('click', async (event) => {
  const button = event.target.closest('.page-size-option');
  if (!button) return;

  const nextSize = Number(button.dataset.size);
  if (!nextSize || nextSize === state.pageSize) return;

  state.pageSize = nextSize;
  updatePageSizeUI();
  await refreshMessagesNow(true, { keepView: false });
});

selectAllCheckbox.addEventListener('change', () => {
  const checked = selectAllCheckbox.checked;
  for (const message of state.messages) {
    toggleSelection(message.id, checked);
  }
  renderMessages();
});

prevPageButton.addEventListener('click', async () => {
  if (state.page <= 1) return;
  state.page -= 1;
  await refreshMessagesNow(false, { keepView: false });
});

nextPageButton.addEventListener('click', async () => {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  await refreshMessagesNow(false, { keepView: false });
});

jumpPageButton.addEventListener('click', async () => {
  await jumpToPage();
});

jumpPageInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await jumpToPage();
  }
});

backToListButton.addEventListener('click', () => {
  setMailView('list');
  state.selectedMessageId = null;
  state.selectedMessage = null;
  renderMessages();
  showMailPage();
});

deleteMessageButton.addEventListener('click', async () => {
  await handleDeleteMessage();
});

deleteSelectedButton.addEventListener('click', async () => {
  await handleDeleteSelected();
});

document.addEventListener('keydown', (event) => {
  void handleListKeyboard(event);
});

translateMessageButton.addEventListener('click', async () => {
  await translateCurrentMessage();
});

showOriginalButton.addEventListener('click', () => {
  if (!state.originalEmailHtml) return;

  state.isTranslatedView = false;
  renderEmailHtml(state.originalEmailHtml);
  showOriginalButton.disabled = true;
  showTranslatedButton.disabled = !state.translatedEmailHtml;
  translateMessageButton.disabled = Boolean(state.translatedEmailHtml);
  setTranslationStatus(state.translatedEmailHtml ? '正在查看原文。' : '检测到非中文邮件，将保留原件排版翻译。');
});

showTranslatedButton.addEventListener('click', () => {
  if (!state.translatedEmailHtml) return;

  state.isTranslatedView = true;
  renderEmailHtml(state.translatedEmailHtml);
  showOriginalButton.disabled = false;
  showTranslatedButton.disabled = true;
  translateMessageButton.disabled = true;
  setTranslationStatus('已翻译为简体中文', 'success');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
    return;
  }

  if (state.isAuthenticated) {
    void refreshMessagesNow(false, { silent: true, keepView: true, updateRoute: false });
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && isMailRoute() && state.isAuthenticated) {
    setView('workspace');
    return;
  }

  if (event.persisted) {
    resetWorkspaceState();
  }
});

window.addEventListener('popstate', () => {
  if (isMailRoute() && state.isAuthenticated) {
    void restoreRouteView(true);
    return;
  }

  resetWorkspaceState();
});

bootstrap().catch((error) => {
  showLoginPage(true);
  setLoginStatus(error.message || '初始化失败', true);
});
