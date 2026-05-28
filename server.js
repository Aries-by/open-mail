const crypto = require('crypto');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const sanitizeHtml = require('sanitize-html');

const app = express();
const port = process.env.PORT || 4399;
const host = process.env.HOST || '127.0.0.1';
const SESSION_COOKIE = 'open_mail_session';
const isProduction = process.env.NODE_ENV === 'production';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录尝试过于频繁，请稍后再试' }
});

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: http: https: cid:",
    "connect-src 'self' https://edge.microsoft.com https://api-edge.cognitive.microsofttranslator.com",
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (req.path === '/app.js' || req.path === '/styles.css') {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/', '/login', '/mail', '/mail/read'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PROVIDERS = {
  qq: {
    key: 'qq',
    label: 'QQ邮箱',
    match: /@qq\.com$/i,
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    spamCandidates: ['Junk', 'Spam', 'Bulk Mail', 'INBOX/Spam', 'INBOX.Junk']
  },
  netease163: {
    key: 'netease163',
    label: '163邮箱',
    match: /@163\.com$/i,
    host: 'imap.163.com',
    port: 993,
    secure: true,
    spamCandidates: ['Junk', 'Spam', 'Bulk Mail', 'INBOX.Spam', 'INBOX/Junk']
  }
};

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const MICROSOFT_TRANSLATE_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MICROSOFT_TRANSLATE_URL = 'https://api-edge.cognitive.microsofttranslator.com/translate';
let microsoftTranslateToken = null;
let microsoftTranslateTokenTime = 0;

function sanitizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTranslateTexts(texts) {
  return (Array.isArray(texts) ? texts : [texts])
    .map((text) => sanitizeText(String(text || '')).slice(0, 5000))
    .filter(Boolean)
    .slice(0, 20);
}

async function getMicrosoftTranslateToken(forceRefresh = false) {
  const tokenAge = Date.now() - microsoftTranslateTokenTime;
  if (microsoftTranslateToken && !forceRefresh && tokenAge < 8 * 60 * 1000) {
    return microsoftTranslateToken;
  }

  const response = await fetch(MICROSOFT_TRANSLATE_AUTH_URL);
  if (!response.ok) {
    throw new Error(`微软翻译授权失败：${response.status}`);
  }

  microsoftTranslateToken = await response.text();
  microsoftTranslateTokenTime = Date.now();
  return microsoftTranslateToken;
}

async function requestMicrosoftTranslation(texts, targetLang = 'zh-Hans', sourceLang) {
  const query = new URLSearchParams({
    to: targetLang,
    'api-version': '3.0'
  });
  if (sourceLang) {
    query.set('from', sourceLang);
  }

  let token = await getMicrosoftTranslateToken(false);
  let response = await fetch(`${MICROSOFT_TRANSLATE_URL}?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(texts.map((text) => ({ Text: text })))
  });

  if (response.status === 401 || response.status === 403) {
    token = await getMicrosoftTranslateToken(true);
    response = await fetch(`${MICROSOFT_TRANSLATE_URL}?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(texts.map((text) => ({ Text: text })))
    });
  }

  if (!response.ok) {
    throw new Error(`微软翻译失败：${response.status}`);
  }

  const result = await response.json();
  return result.map((item) => item?.translations?.[0]?.text || '');
}

function sanitizeEmailHtml(html) {
  const htmlBody = String(html || '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<title\b[\s\S]*?<\/title>/gi, '');
  const bodyMatch = htmlBody.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  return sanitizeHtml(bodyMatch ? bodyMatch[1] : htmlBody, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'span', 'div']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'referrerpolicy'],
      '*': ['class', 'style', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'cid'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'cid', 'data']
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true),
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy', referrerpolicy: 'no-referrer' }, true)
    }
  });
}

function detectProvider(email, host) {
  const providerByEmail = Object.values(PROVIDERS).find((item) => item.match.test(email || ''));
  if (!providerByEmail) {
    throw new Error('仅支持 QQ 邮箱和 163 邮箱');
  }

  if (host) {
    const normalizedHost = String(host).trim().toLowerCase();
    const providerByHost = Object.values(PROVIDERS).find((item) => item.host === normalizedHost);
    if (providerByHost && providerByHost.key === providerByEmail.key) {
      return providerByHost;
    }

    throw new Error('仅支持 QQ 邮箱和 163 邮箱');
  }

  return providerByEmail;
}

function extractAddressList(items = []) {
  return items
    .map((item) => {
      if (!item) return null;
      const name = sanitizeText(item.name);
      const address = sanitizeText(item.address);
      if (!address) return null;
      return name ? `${name} <${address}>` : address;
    })
    .filter(Boolean)
    .join(', ');
}

function extractPrimarySender(items = []) {
  const first = items.find((item) => item?.address || item?.name);
  if (!first) {
    return '';
  }

  return sanitizeText(first.name) || sanitizeText(first.address) || '';
}

function addressObjects(items = []) {
  return items
    .map((item) => {
      if (!item?.address) return null;
      return {
        name: sanitizeText(item.name),
        address: sanitizeText(item.address)
      };
    })
    .filter(Boolean);
}

function hasAttachment(node) {
  if (!node) {
    return false;
  }

  if (node.disposition === 'attachment') {
    return true;
  }

  if (!Array.isArray(node.childNodes)) {
    return false;
  }

  return node.childNodes.some((childNode) => hasAttachment(childNode));
}

function createClient(config) {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.email,
      pass: config.password
    },
    logger: false
  });
}

async function withClient(config, callback) {
  const client = createClient(config);
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function findSpamMailbox(client, provider) {
  const listing = await client.list();
  const folders = listing.map((box) => ({
    path: box.path,
    normalized: box.path.toLowerCase()
  }));

  for (const candidate of provider.spamCandidates) {
    const match = folders.find((folder) => folder.normalized === candidate.toLowerCase());
    if (match) {
      return match.path;
    }
  }

  const fuzzyMatch = folders.find((folder) => /junk|spam|bulk/.test(folder.normalized));
  return fuzzyMatch ? fuzzyMatch.path : null;
}

async function openMailbox(client, mailboxPath) {
  return client.mailbox?.path === mailboxPath ? client.mailbox : client.mailboxOpen(mailboxPath);
}

function toMessageSummary(message, mailboxPath, folderType) {
  const envelope = message.envelope || {};
  const messageId = sanitizeText(envelope.messageId) || `${mailboxPath}:${message.uid}`;
  const date = message.internalDate || envelope.date || null;
  const senderName = extractPrimarySender(envelope.from);
  return {
    id: messageId,
    uid: message.uid,
    mailbox: mailboxPath,
    folderType,
    subject: sanitizeText(envelope.subject) || '(无主题)',
    senderName: senderName || '未知发件人',
    from: extractAddressList(envelope.from),
    to: extractAddressList(envelope.to),
    date,
    timestamp: date ? new Date(date).getTime() : 0,
    isSeen: typeof message.flags?.has === 'function' ? message.flags.has('\\Seen') : false,
    hasAttachment: message.bodyStructure ? hasAttachment(message.bodyStructure) : false,
    preview: sanitizeText(message.bodyParts?.get('1')?.toString?.() || '')
  };
}

async function fetchMailboxPage(client, mailboxPath, folderType, page, pageSize, fetchLimit = pageSize) {
  const lock = await client.getMailboxLock(mailboxPath);

  try {
    const mailbox = client.mailbox;
    const exists = mailbox.exists || 0;

    if (!exists) {
      return {
        total: 0,
        messages: []
      };
    }

    const end = Math.max(1, exists - (page - 1) * pageSize);
    const start = Math.max(1, end - fetchLimit + 1);
    const range = `${start}:${end}`;
    const messages = [];

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true
    })) {
      messages.push(toMessageSummary(message, mailboxPath, folderType));
    }

    messages.reverse();
    return {
      total: exists,
      messages
    };
  } finally {
    lock.release();
  }
}

async function searchMailboxPage(client, mailboxPath, folderType, keyword, page, pageSize) {
  const lock = await client.getMailboxLock(mailboxPath);

  try {
    const uids = await client.search({ text: keyword }, { uid: true });
    const matchedUids = Array.isArray(uids) ? uids : [];
    if (!matchedUids.length) {
      return { total: 0, messages: [] };
    }

    const latestUids = matchedUids.slice().sort((a, b) => b - a).slice(0, page * pageSize);
    const messages = [];

    for await (const message of client.fetch(latestUids, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true
    }, { uid: true })) {
      messages.push(toMessageSummary(message, mailboxPath, folderType));
    }

    return {
      total: matchedUids.length,
      messages
    };
  } finally {
    lock.release();
  }
}

function mergeAndFilterMessages(messageGroups, keyword, alreadyFiltered = false) {
  const deduped = Array.from(
    new Map(messageGroups.flat().map((message) => [message.id, message])).values()
  );

  let items = deduped.sort((a, b) => b.timestamp - a.timestamp);

  if (keyword && !alreadyFiltered) {
    const query = keyword.toLowerCase();
    items = items.filter((message) => {
      return [message.subject, message.from, message.to, message.mailbox]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }

  return items;
}

async function fetchMergedInbox(config, options) {
  const page = Math.max(Number(options.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 20, 10), 50);
  const keyword = sanitizeText(options.query);

  const provider = detectProvider(config.email, config.host);
  let spamMailbox = Object.prototype.hasOwnProperty.call(config, 'spamMailbox') ? config.spamMailbox : undefined;

  if (spamMailbox === undefined) {
    spamMailbox = await withClient(config, async (client) => findSpamMailbox(client, provider));
    config.spamMailbox = spamMailbox;
  }

  const [inboxPage, spamPage] = await Promise.all([
    withClient(config, async (client) => {
      await openMailbox(client, 'INBOX');
      if (keyword) {
        return searchMailboxPage(client, 'INBOX', 'inbox', keyword, page, pageSize);
      }
      return fetchMailboxPage(client, 'INBOX', 'inbox', 1, pageSize, page * pageSize);
    }),
    spamMailbox && spamMailbox.toUpperCase() !== 'INBOX'
      ? withClient(config, async (client) => {
        await openMailbox(client, spamMailbox);
        if (keyword) {
          return searchMailboxPage(client, spamMailbox, 'spam', keyword, page, pageSize);
        }
        return fetchMailboxPage(client, spamMailbox, 'spam', 1, pageSize, page * pageSize);
      })
      : Promise.resolve({ total: 0, messages: [] })
  ]);

  const merged = mergeAndFilterMessages([inboxPage.messages, spamPage.messages], keyword, Boolean(keyword));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const total = inboxPage.total + spamPage.total;

  return {
    provider: provider.label,
    email: config.email,
    spamMailbox,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    messages: merged.slice(start, end),
    hasNextPage: page < Math.max(1, Math.ceil(total / pageSize))
  };
}

async function fetchMessageDetail(config, detail) {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(detail.mailbox);

    try {
      const message = await client.fetchOne(String(detail.uid), {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        bodyStructure: true,
        source: true
      }, { uid: true });

      if (!message) {
        throw new Error('邮件不存在或已被删除');
      }

      const parsed = await simpleParser(message.source);
      const plainText = sanitizeText(parsed.text || '');
      const html = parsed.html ? sanitizeEmailHtml(parsed.html) : '';
      const textAsHtml = plainText
        ? `<pre style="white-space:pre-wrap;word-break:break-word;font:14px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;color:inherit;">${escapeHtml(parsed.text || '')}</pre>`
        : '<p>这封邮件没有可显示的正文内容。</p>';

      return {
        id: detail.id,
        uid: message.uid,
        mailbox: detail.mailbox,
        folderType: detail.folderType,
        subject: sanitizeText(parsed.subject) || '(无主题)',
        from: extractAddressList(parsed.from?.value),
        to: extractAddressList(parsed.to?.value),
        cc: extractAddressList(parsed.cc?.value),
        date: parsed.date || message.internalDate || null,
        isSeen: typeof message.flags?.has === 'function' ? message.flags.has('\\Seen') : false,
        text: parsed.text || '',
        html: html || textAsHtml,
        snippet: plainText.slice(0, 240),
        attachments: (parsed.attachments || []).map((item) => ({
          filename: item.filename || '未命名附件',
          contentType: item.contentType || 'application/octet-stream',
          size: item.size || 0
        })),
        fromList: addressObjects(parsed.from?.value),
        toList: addressObjects(parsed.to?.value)
      };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessage(config, detail) {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(detail.mailbox);

    try {
      const success = await client.messageDelete(String(detail.uid), { uid: true });
      if (!success) {
        throw new Error('邮件删除失败，可能已被移动或不存在');
      }
      return { success: true, deleted: 1 };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessageWithClient(client, detail) {
  const lock = await client.getMailboxLock(detail.mailbox);
  try {
    const success = await client.messageDelete(String(detail.uid), { uid: true });
    if (!success) {
      throw new Error('邮件可能已被移动或不存在');
    }
    return { success: true };
  } finally {
    lock.release();
  }
}

async function deleteMessages(config, items) {
  return withClient(config, async (client) => {
    const normalized = [];
    const seen = new Set();

    for (const item of items) {
      const mailbox = String(item.mailbox);
      const uid = Number(item.uid);
      if (!mailbox || !Number.isInteger(uid) || uid <= 0) {
        continue;
      }

      const key = `${mailbox}:${uid}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push({ mailbox, uid });
    }

    if (!normalized.length) {
      throw new Error('没有可删除的邮件');
    }

    const failed = [];
    let deleted = 0;
    for (const item of normalized) {
      try {
        await deleteMessageWithClient(client, item);
        deleted += 1;
      } catch (error) {
        failed.push({ ...item, error: error.message || '删除失败' });
      }
    }

    if (!deleted && failed.length) {
      const error = new Error(`删除失败：${failed[0].error}`);
      error.failed = failed;
      throw error;
    }

    return { success: failed.length === 0, deleted, failed };
  });
}

function createSession(config) {
  const token = crypto.randomUUID();
  sessions.set(token, {
    ...config,
    createdAt: Date.now(),
    touchedAt: Date.now()
  });
  return token;
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf('=');
      if (separator === -1) return cookies;
      const key = decodeURIComponent(item.slice(0, separator));
      const value = decodeURIComponent(item.slice(separator + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function setSessionCookie(res, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`);
}

function touchSession(session) {
  session.touchedAt = Date.now();
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.touchedAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}

function requireSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token || !sessions.has(token)) {
    throw new Error('登录已失效，请重新登录');
  }

  const session = sessions.get(token);
  touchSession(session);
  return { token, session };
}

setInterval(cleanupSessions, 1000 * 60 * 30).unref();

app.get('/api/providers', (_req, res) => {
  res.json({
    providers: Object.values(PROVIDERS).map((provider) => ({
      key: provider.key,
      label: provider.label,
      host: provider.host,
      port: provider.port,
      secure: provider.secure
    }))
  });
});

app.get('/api/session', (req, res) => {
  try {
    const { session } = requireSession(req);
    const provider = detectProvider(session.email, session.host);
    return res.json({
      provider: provider.label,
      email: session.email,
      host: session.host,
      port: session.port,
      secure: session.secure
    });
  } catch (error) {
    return res.status(401).json({ error: error.message || '登录已失效，请重新登录' });
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password, host, port: customPort, secure } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '请填写邮箱地址和密码或授权码' });
  }

  try {
    const provider = detectProvider(String(email).trim(), host ? String(host).trim() : undefined);
    const config = {
      email: String(email).trim(),
      password: String(password),
      host: provider.host,
      port: Number(customPort) || provider.port,
      secure: typeof secure === 'boolean' ? secure : provider.secure
    };

    await withClient(config, async (client) => {
      await client.mailboxOpen('INBOX');
    });

    const sessionToken = createSession(config);
    setSessionCookie(res, sessionToken);
    return res.json({
      provider: provider.label,
      email: config.email,
      host: config.host,
      port: config.port,
      secure: config.secure
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || '登录失败，请检查 IMAP、账号和授权码是否正确'
    });
  }
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session } = requireSession(req);
    const data = await fetchMergedInbox(session, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      query: req.query.query
    });
    return res.json(data);
  } catch (error) {
    const status = error.message === '登录已失效，请重新登录' ? 401 : 500;
    return res.status(status).json({ error: error.message || '获取邮件失败' });
  }
});

app.get('/api/message-detail', async (req, res) => {
  try {
    const { session } = requireSession(req);
    const { uid, mailbox, folderType, id } = req.query;

    if (!uid || !mailbox) {
      return res.status(400).json({ error: '缺少邮件标识，无法读取详情' });
    }

    const detail = await fetchMessageDetail(session, {
      uid: Number(uid),
      mailbox: String(mailbox),
      folderType: String(folderType || 'inbox'),
      id: String(id || `${mailbox}:${uid}`)
    });

    return res.json(detail);
  } catch (error) {
    const status = error.message === '登录已失效，请重新登录' ? 401 : 500;
    return res.status(status).json({ error: error.message || '读取邮件详情失败' });
  }
});

app.post('/api/translate', async (req, res) => {
  try {
    requireSession(req);
    const texts = normalizeTranslateTexts(req.body?.texts || req.body?.text || []);
    const targetLang = sanitizeText(req.body?.targetLang || 'zh-Hans') || 'zh-Hans';
    const sourceLang = req.body?.sourceLang ? sanitizeText(req.body.sourceLang) : undefined;

    if (!texts.length) {
      return res.status(400).json({ error: '缺少要翻译的文本' });
    }

    const translations = await requestMicrosoftTranslation(texts, targetLang, sourceLang);
    return res.json({ provider: 'microsoft-edge', targetLang, translations });
  } catch (error) {
    const status = error.message === '登录已失效，请重新登录' ? 401 : 500;
    return res.status(status).json({ error: error.message || '翻译失败' });
  }
});

app.delete('/api/message', async (req, res) => {
  try {
    const { session } = requireSession(req);
    const { uid, mailbox } = req.query;

    if (!Number.isInteger(Number(uid)) || Number(uid) <= 0 || !mailbox) {
      return res.status(400).json({ error: '缺少邮件标识，无法删除邮件' });
    }

    const result = await deleteMessage(session, {
      uid: Number(uid),
      mailbox: String(mailbox)
    });

    return res.json(result);
  } catch (error) {
    const status = error.message === '登录已失效，请重新登录' ? 401 : 500;
    return res.status(status).json({ error: error.message || '删除邮件失败' });
  }
});

app.post('/api/messages/delete', async (req, res) => {
  try {
    const { session } = requireSession(req);
    const items = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!items.length) {
      return res.status(400).json({ error: '请选择要删除的邮件' });
    }

    const result = await deleteMessages(session, items);
    return res.json(result);
  } catch (error) {
    const status = error.message === '登录已失效，请重新登录' ? 401 : 500;
    return res.status(status).json({
      error: error.message || '批量删除邮件失败',
      failed: error.failed || []
    });
  }
});

app.listen(port, host, () => {
  console.log(`Mail service listening on http://${host}:${port}`);
});
