/* app.js — واجهة التطبيق والمنطق الرئيسي */

import * as DB from './db.js';
import { Settings, Conversations, Messages, Assets, Artifacts, Agents, storageEstimate, askPersistent } from './db.js';
import { PROVIDERS, getProvider, getConnection, getKeys, listModels, testConnection, availableProviders, chat, transcribe } from './providers.js';
import { fileToAttachment, attachmentDataUrl, attachmentBlob, VoiceRecorder, speak, stopSpeaking, ttsSupported } from './media.js';
import { renderMarkdown, extractArtifacts, langLabel } from './markdown.js';
import { TOOL_DEFS, TOOL_LIST, runAgentLoop } from './tools.js';
import { runInFrame, stopFrame, attachRunner, artifactToHtmlFile, artifactFileName } from './preview.js';
import { uid, esc, fmtTime, bytes, clampText, download, copyText, debounce } from './util.js';

/* ============================ الحالة ============================ */
export const state = {
  view: 'chats',
  conversations: [],
  current: null,
  messages: [],
  attachments: [],
  agents: [],
  artifacts: [],
  streaming: false,
  controller: null,
  providerId: '',
  model: '',
  search: '',
  settings: {},
  toolSteps: [],
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============================ أدوات واجهة ============================ */
let toastTimer = null;
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function openModal({ title, body, actions = [], onClose }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.className || '');
    b.textContent = a.label;
    b.onclick = () => a.onClick?.($('#modalBody'));
    foot.appendChild(b);
  }
  const close = () => { $('#modal').hidden = true; onClose?.(); };
  $('#modalClose').onclick = close;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') close(); };
  $('#modal').hidden = false;
  return { close, body: $('#modalBody') };
}

export const closeModal = () => { $('#modal').hidden = true; };

/* ============================ الثيم ============================ */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6ff' : '#0b1020');
}

/* ============================ التوجيه (Router) ============================ */
const VIEW_TITLES = {
  chats: 'المحادثات', chat: 'محادثة', agents: 'الوكلاء (Agents)',
  preview: 'المعاينة (Preview)', settings: 'الإعدادات والمفاتيح', about: 'عن التطبيق',
};

export function goto(view, opts = {}) {
  state.view = view;
  $$('.view').forEach((v) => { v.hidden = true; });
  const target = $(`#view-${view}`) || $('#view-chats');
  target.hidden = false;
  $('#topbarTitle').textContent = opts.title || VIEW_TITLES[view] || 'مساعدي';
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.goto === view));
  document.body.classList.remove('drawer-open');
  if (view === 'agents') renderAgents();
  if (view === 'preview') renderPreview();
  if (view === 'settings') renderSettings();
  if (view === 'about') renderAbout();
  if (view === 'chats') renderChatsHome();
  if (view === 'chat') scrollMessages();
}

function openDrawer() { document.body.classList.add('drawer-open'); const sc = document.getElementById('scrim'); if (sc) sc.hidden = false; }
function closeDrawer() { document.body.classList.remove('drawer-open'); const sc = document.getElementById('scrim'); if (sc) sc.hidden = true; }

/* ============================ الإعدادات الافتراضية ============================ */
const DEFAULTS = {
  theme: 'dark',
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
  defaultAgent: '',
  maxTokens: 4096,
  temperature: 0.7,
  autoTitle: true,
  speakReplies: false,
  agentsEnabled: true,
  fetchProxy: 'https://r.jina.ai/',
  searchKeys: {},
  memory: [],
  systemPrompt: 'أنت مساعد ذكي مفيد ودقيق. أجب بنفس لغة المستخدم. استخدم Markdown في الردود، وضع الأكواد داخل كتل ```مع تحديد اللغة```.',
  baseUrls: {},
  apiKeys: {},
  agents: [],
};

async function loadSettings() {
  const all = await Settings.all();
  state.settings = { ...DEFAULTS, ...all };
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (all[k] === undefined) await Settings.set(k, v);
  }
  applyTheme(state.settings.theme);
}

async function setSetting(k, v) {
  state.settings[k] = v;
  await Settings.set(k, v);
}

/* ============================ قائمة المحادثات ============================ */
async function loadConversations() {
  state.conversations = await Conversations.list();
  renderConversations();
}

export function renderConversations() {
  const box = $('#convList');
  const q = (state.search || '').trim().toLowerCase();
  const list = state.conversations.filter((c) => !q || (c.title || '').toLowerCase().includes(q));
  if (!list.length) {
    box.innerHTML = `<div class="empty" style="padding:16px;font-size:13px">${q ? 'لا نتائج للبحث' : 'لا توجد محادثات بعد — ابدأ محادثة جديدة'}</div>`;
    return;
  }
  box.innerHTML = list.map((c) => `
    <div class="conv-item ${state.current?.id === c.id ? 'active' : ''}" data-id="${c.id}" role="listitem">
      <span>${c.agentId ? '🤖' : '💬'}</span>
      <div class="ci-main">
        <div class="ci-title">${esc(c.title || 'محادثة')}</div>
        <div class="ci-sub">${esc(c.model || 'بدون موديل')} • ${fmtTime(c.updatedAt)}</div>
      </div>
      <button class="ci-del" data-del="${c.id}" title="حذف">🗑</button>
    </div>`).join('');

  box.querySelectorAll('.conv-item').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.dataset.del) return;
      openConversation(el.dataset.id);
    };
  });
  box.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); confirmDeleteConversation(b.dataset.del); };
  });
}

export async function createConversation(partial = {}) {
  const providerId = partial.providerId || state.providerId || state.settings.defaultProvider;
  const model = partial.model || state.model || state.settings.defaultModel;
  const conv = await Conversations.create({ ...partial, providerId, model });
  state.conversations.unshift(conv);
  renderConversations();
  return conv;
}

export async function newChat(partial = {}) {
  const conv = await createConversation(partial);
  await openConversation(conv.id);
  setTimeout(() => $('#input')?.focus(), 120);
  return conv;
}

export async function openConversation(id) {
  const conv = await Conversations.get(id);
  if (!conv) { toast('المحادثة غير موجودة'); return; }
  state.current = conv;
  state.messages = await Messages.byConversation(id);
  state.attachments = [];
  state.toolSteps = [];
  state.providerId = conv.providerId || state.settings.defaultProvider;
  state.model = conv.model || state.settings.defaultModel;
  renderConversations();
  renderChatHead();
  renderMessages();
  renderAttachments();
  goto('chat', { title: conv.title });
}

async function confirmDeleteConversation(id) {
  const conv = state.conversations.find((c) => c.id === id);
  openModal({
    title: 'حذف المحادثة',
    body: `<p>هل تريد حذف «${esc(conv?.title || 'محادثة')}» وكل رسائلها؟ لا يمكن التراجع.</p>`,
    actions: [
      { label: 'إلغاء', onClick: closeModal },
      { label: 'حذف', className: 'danger', onClick: async () => {
        await Messages.removeByConversation(id);
        await Conversations.remove(id);
        state.conversations = state.conversations.filter((c) => c.id !== id);
        if (state.current?.id === id) { state.current = null; goto('chats'); }
        renderConversations();
        closeModal(); toast('تم الحذف');
      } },
    ],
  });
}

export async function renameCurrentConversation() {
  if (!state.current) return;
  openModal({
    title: 'اسم المحادثة',
    body: `<div class="field"><label>الاسم</label><input id="convTitleInput" value="${esc(state.current.title)}" /></div>`,
    actions: [
      { label: 'إلغاء', onClick: closeModal },
      { label: 'حفظ', className: 'primary', onClick: async () => {
        const v = $('#convTitleInput').value.trim() || 'محادثة';
        await Conversations.update(state.current.id, { title: v });
        state.current.title = v;
        const i = state.conversations.findIndex((c) => c.id === state.current.id);
        if (i >= 0) state.conversations[i].title = v;
        renderConversations(); $('#topbarTitle').textContent = v;
        closeModal(); toast('تم الحفظ');
      } },
    ],
  });
  setTimeout(() => $('#convTitleInput')?.select(), 60);
}

/* ============================ الصفحة الرئيسية ============================ */
async function renderChatsHome() {
  const avail = await availableProviders();
  const arts = await Artifacts.list();
  const memory = state.settings.memory || [];
  const cards = [
    { t: '🔑 المفاتيح المضافة', d: `${avail.length} مزوّد متاح من ${PROVIDERS.length}. ${avail.length ? 'جاهز للاستخدام.' : 'أضف مفتاحًا للبدء.'}` },
    { t: '💬 محادثاتك', d: `${state.conversations.length} محادثة محفوظة على جهازك.` },
    { t: '🧪 مشاريع المعاينة', d: `${arts.length} كود محفوظ يمكن تشغيله فورًا.` },
    { t: '🧠 ذاكرة المساعد', d: `${memory.length} معلومة محفوظة عنك.` },
    { t: '🎤 صوت وصور وفيديو', d: 'أرسل ما تشاء — والصوت يتحوّل لنص تلقائيًا.' },
    { t: '🤖 الوكلاء', d: 'وكلاء جاهزون يستخدمون الأدوات: كود، بحث، صور، معاينة.' },
  ];
  $('#quickCards').innerHTML = cards.map((c) => `<div class="card"><h3>${c.t}</h3><p>${c.d}</p></div>`).join('');
}

/* ============================ ترويسة المحادثة ============================ */
async function renderChatHead() {
  const head = $('#chatHead');
  const avail = await availableProviders();
  const list = avail.length ? avail : PROVIDERS;
  const prov = state.providerId;
  const models = [...new Set([...(getProvider(prov)?.models || []), state.model].filter(Boolean))];

  head.innerHTML = `
    <select id="agentSelect" title="الوكيل">
      <option value="">💬 محادثة عادية</option>
      ${state.agents.map((a) => `<option value="${a.id}" ${state.current?.agentId === a.id ? 'selected' : ''}>${a.emoji} ${esc(a.name)}</option>`).join('')}
    </select>
    <select id="provSelect" title="المزوّد">
      ${list.map((p) => `<option value="${p.id}" ${p.id === prov ? 'selected' : ''}>${p.emoji} ${esc(p.label)}${p.noKey ? '' : (p.apiKey ? '' : '')}</option>`).join('')}
    </select>
    <input id="modelInput" list="modelList" value="${esc(state.model || '')}" placeholder="اسم الموديل" title="الموديل" />
    <datalist id="modelList">${models.map((m) => `<option value="${esc(m)}"></option>`).join('')}</datalist>
    <button class="icon-btn" id="refreshModels" title="جلب الموديلات من المزوّد">🔄</button>
    <span class="spacer"></span>
    <button class="btn sm" id="renameConv" title="تغيير اسم المحادثة">✏️ الاسم</button>
    <button class="btn sm" id="clearConv" title="مسح رسائل هذه المحادثة">🧹</button>
  `;

  $('#agentSelect').onchange = async (e) => {
    const id = e.target.value;
    const agent = state.agents.find((a) => a.id === id);
    await Conversations.update(state.current.id, { agentId: id, providerId: agent?.providerId || state.providerId, model: agent?.model || state.model });
    state.current.agentId = id;
    if (agent?.providerId) state.providerId = agent.providerId;
    if (agent?.model) state.model = agent.model;
    renderChatHead(); renderMessages();
    toast(agent ? `الوكيل «${agent.name}» مُفعّل` : 'محادثة عادية');
  };
  $('#provSelect').onchange = async (e) => {
    state.providerId = e.target.value;
    const p = getProvider(state.providerId);
    state.model = p?.models?.[0] || state.model;
    await Conversations.update(state.current.id, { providerId: state.providerId, model: state.model });
    renderChatHead(); updateHint();
  };
  $('#modelInput').onchange = async (e) => {
    state.model = e.target.value.trim();
    await Conversations.update(state.current.id, { model: state.model });
    updateHint();
  };
  $('#refreshModels').onclick = async () => {
    toast('جارٍ جلب الموديلات…');
    const { models: m, fromApi } = await listModels(state.providerId);
    if (!m?.length) return toast('لم يتم العثور على موديلات');
    $('#modelList').innerHTML = m.map((x) => `<option value="${esc(x)}"></option>`).join('');
    toast(fromApi ? `تم جلب ${m.length} موديل من المزوّد` : `القائمة المقترحة (${m.length} موديل)`);
  };
  $('#renameConv').onclick = renameCurrentConversation;
  $('#clearConv').onclick = async () => {
    await Messages.removeByConversation(state.current.id);
    state.messages = [];
    renderMessages();
    toast('تم مسح الرسائل');
  };
  updateHint();
}

function updateHint() {
  const p = getProvider(state.providerId);
  const el = $('#composerHint');
  if (!el) return;
  const caps = p?.caps || {};
  const bits = [];
  if (caps.vision) bits.push('صور ✅'); else bits.push('صور ❌');
  if (caps.audioIn) bits.push('صوت ✅'); else bits.push('صوت ❌');
  if (caps.video) bits.push('فيديو ✅'); else bits.push('فيديو ❌');
  const agent = state.current?.agentId ? state.agents.find((a) => a.id === state.current.agentId) : null;
  const toolNames = agent?.tools?.length ? agent.tools : (state.settings.agentsEnabled !== false ? defaultTools(state.providerId).map((t) => t.name) : []);
  const toolBit = toolNames.length ? ` • 🛠 ${toolNames.length} أداة${agent ? ' (وكيل: ' + agent.name + ')' : ''}` : '';
  el.textContent = p ? `${p.emoji} ${p.label} — ${bits.join(' • ')}${toolBit}` : '';
}

/* ============================ عرض الرسائل ============================ */
const codeRegistry = new Map(); // key -> {lang, code}

function partHtml(p, msgId) {
  if (p.type === 'text') return '';
  const chip = `<span class="file-chip" data-asset="${p.assetId || ''}" data-name="${esc(p.name || 'ملف')}">${p.icon || '📎'} ${esc(p.name || 'ملف')} <small>${bytes(p.size)}</small></span>`;
  if (!p.dataUrl) return chip; // ملفات كبيرة: تُعرض كزر تحميل بدل معاينة مباشرة
  if (p.type === 'image') return `<div><img class="md-img" src="${p.dataUrl}" alt="${esc(p.name || '')}" loading="lazy" /></div>`;
  if (p.type === 'video') return `<div><video controls preload="metadata" src="${p.dataUrl}"></video></div>`;
  if (p.type === 'audio') return `<div><audio controls src="${p.dataUrl}"></audio></div>`;
  return chip;
}

function messageBodyHtml(m) {
  const msgId = m.id;
  const parts = Array.isArray(m.content) ? m.content : [];
  const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  let html = '';
  if (text) {
    html += renderMarkdown(text, {
      onCodeBlock: (b, i) => {
        const key = `${msgId}:${i}`;
        codeRegistry.set(key, b);
        const runnable = b.lang && ['html', 'htm', 'svg', 'xml', 'css', 'js', 'javascript', 'mjs'].includes(b.lang);
        return `<div class="code-block">
          <div class="code-actions">
            <span class="badge">${esc(langLabel(b.lang))}</span>
            <button class="btn sm" data-copy="${key}">📋 نسخ</button>
            <button class="btn sm" data-copy-file="${key}">⬇️ تنزيل</button>
            ${runnable ? `<button class="btn sm ok" data-run="${key}">▶️ تشغيل في المعاينة</button>` : ''}
          </div>
          <pre><code class="lang-${esc(b.lang)}">${b.code}</code></pre>
        </div>`;
      },
    });
  }
  const media = parts.filter((p) => p.type !== 'text').map((p) => partHtml(p, msgId)).join('');
  return html + (media ? `<div class="msg-media">${media}</div>` : '');
}

function renderMessage(m) {
  const isUser = m.role === 'user';
  const agent = m.meta?.agentId ? state.agents.find((a) => a.id === m.meta.agentId) : null;
  const avatar = isUser ? '👤' : (agent?.emoji || '🤖');
  const metaBits = [];
  metaBits.push(`<span>${fmtTime(m.createdAt)}</span>`);
  if (m.meta?.model) metaBits.push(`<span>${esc(m.meta.model)}</span>`);
  if (m.meta?.usage?.total_tokens) metaBits.push(`<span>${m.meta.usage.total_tokens} رمز</span>`);
  if (m.meta?.toolSteps?.length) metaBits.push(`<span>🛠 ${m.meta.toolSteps.length} أداة</span>`);
  metaBits.push(`<button class="btn sm" data-msg-copy="${m.id}">📋</button>`);
  if (!isUser) {
    if (ttsSupported()) metaBits.push(`<button class="btn sm" data-msg-speak="${m.id}">🔊</button>`);
    metaBits.push(`<button class="btn sm" data-msg-del="${m.id}">🗑</button>`);
  }
  return `<div class="msg ${isUser ? 'user' : 'assistant'}" data-mid="${m.id}">
    <div class="avatar">${avatar}</div>
    <div class="bubble">
      ${m.meta?.toolSteps?.length ? `<div style="margin-bottom:8px">${m.meta.toolSteps.map((s) => `<div class="tool-step"><b>${esc(s.name)}</b> — ${esc(clampText(s.summary || '', 160))}</div>`).join('')}</div>` : ''}
      ${messageBodyHtml(m)}
      <div class="meta">${metaBits.join('')}</div>
    </div>
  </div>`;
}

export function renderMessages() {
  const box = $('#messages');
  if (!state.current) { box.innerHTML = ''; return; }
  if (!state.messages.length) {
    box.innerHTML = `<div class="empty">
      <div style="font-size:34px">💬</div>
      <p>ابدأ الحديث — اكتب رسالة أو سجّل صوتًا أو أرفق صورة/فيديو/ملف.</p>
      <p style="font-size:12px">الموديل الحالي: <b>${esc(state.model || 'لم يُحدد')}</b></p>
    </div>`;
    return;
  }
  box.innerHTML = state.messages.map(renderMessage).join('');
  wireMessageActions();
}

function wireMessageActions() {
  $$('#messages [data-copy]').forEach((b) => {
    b.onclick = async () => { const c = codeRegistry.get(b.dataset.copy); if (c) { await copyText(c.code); toast('تم نسخ الكود'); } };
  });
  $$('#messages [data-copy-file]').forEach((b) => {
    b.onclick = () => {
      const c = codeRegistry.get(b.dataset.copyFile);
      if (!c) return;
      const ext = { html: 'html', htm: 'html', css: 'css', js: 'js', javascript: 'js', mjs: 'js', svg: 'svg', xml: 'xml' }[c.lang] || 'txt';
      download(`code-${Date.now()}.${ext}`, c.code, 'text/plain;charset=utf-8');
    };
  });
  $$('#messages [data-run]').forEach((b) => {
    b.onclick = async () => {
      const c = codeRegistry.get(b.dataset.run);
      if (!c) return;
      const art = await Artifacts.add({ title: `كود من المحادثة`, lang: c.lang || 'html', code: c.code, kind: 'web', conversationId: state.current?.id || '' });
      state.artifacts = await Artifacts.list();
      goto('preview');
      setTimeout(() => selectArtifact(art.id), 60);
      toast('تم فتح الكود في صفحة المعاينة');
    };
  });
  $$('#messages [data-msg-copy]').forEach((b) => {
    b.onclick = async () => {
      const m = state.messages.find((x) => x.id === b.dataset.msgCopy);
      if (m) { await copyText((m.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n')); toast('تم النسخ'); }
    };
  });
  $$('#messages [data-msg-speak]').forEach((b) => {
    b.onclick = () => {
      const m = state.messages.find((x) => x.id === b.dataset.msgSpeak);
      const t = (m?.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      try { speak(t); } catch (e) { toast(e.message); }
    };
  });
  $$('#messages [data-msg-del]').forEach((b) => {
    b.onclick = async () => {
      await Messages.remove(b.dataset.msgDel);
      state.messages = state.messages.filter((x) => x.id !== b.dataset.msgDel);
      renderMessages();
    };
  });
}

function scrollMessages() {
  const box = $('#messages');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ============================ المرفقات والمُدخَل ============================ */
export function renderAttachments() {
  const box = $('#attachments');
  if (!state.attachments.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = state.attachments.map((a) => `
    <div class="att" data-att="${a.id}">
      ${a.kind === 'image' && a.dataUrl ? `<img src="${a.dataUrl}" alt="" />` : a.kind === 'video' && a.dataUrl ? `<video src="${a.dataUrl}" muted></video>` : `<span style="font-size:20px">${a.icon}</span>`}
      <span class="nm">${esc(a.name)}<br><small>${bytes(a.size)}${a.tooBig ? ' — كبير جدًا للإرسال' : ''}</small></span>
      <button class="x" data-att-del="${a.id}" title="إزالة">✕</button>
    </div>`).join('');
  box.querySelectorAll('[data-att-del]').forEach((b) => {
    b.onclick = () => {
      state.attachments = state.attachments.filter((x) => x.id !== b.dataset.attDel);
      renderAttachments();
    };
  });
}

export async function addFiles(files) {
  for (const f of files) {
    if (f.size > 60 * 1024 * 1024) { toast(`«${f.name}» أكبر من 60 ميجابايت — تم تجاهله`); continue; }
    try {
      const att = await fileToAttachment(f);
      state.attachments.push(att);
    } catch (e) { toast('تعذّر إضافة ' + f.name + ': ' + e.message); }
  }
  renderAttachments();
}

function renderToolLog() {
  const box = $('#toolLog');
  if (!state.toolSteps.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = state.toolSteps.map((s) => `<div class="tool-step"><b>${esc(s.name)}</b> — ${esc(s.summary || '')}</div>`).join('');
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
}

/* ============================ إرسال الرسالة ============================ */
function partsFromAttachments() {
  return state.attachments.map((a) => ({
    type: a.kind === 'file' ? 'file' : a.kind,
    dataUrl: a.dataUrl, mime: a.mime, name: a.name, size: a.size,
    text: a.text || '', assetId: a.assetId, icon: a.icon,
  }));
}

function buildApiHistory(extraSystem) {
  return state.messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content) ? m.content.map((p) => ({ ...p })) : [],
    tool_calls: m.tool_calls,
    tool_call_id: m.tool_call_id,
    name: m.name,
  }));
}

/* الأدوات التي تُتاح تلقائيًا لأي نموذج (وضع الوكلاء العام) */
function defaultTools(providerId) {
  const names = ['run_javascript', 'calculator', 'current_datetime', 'create_preview', 'read_file', 'write_file', 'remember', 'recall'];
  const caps = getProvider(providerId)?.caps || {};
  if (caps.imageGen) names.push('generate_image');
  const sk = state.settings.searchKeys || {};
  if (sk.tavily || sk.brave || state.settings.fetchProxy) { names.push('web_search', 'fetch_url'); }
  return names.map((n) => TOOL_DEFS.find((t) => t.name === n)).filter(Boolean);
}

function agentFor(conv) {
  if (!conv?.agentId) return null;
  return state.agents.find((a) => a.id === conv.agentId) || null;
}

function systemFor(agent) {
  const base = agent?.system?.trim() || state.settings.systemPrompt || '';
  const mem = state.settings.memory || [];
  const memBlock = mem.length ? `\n\nمعلومات محفوظة عن المستخدم (استخدمها عند الحاجة):\n- ${mem.join('\n- ')}` : '';
  return base + memBlock;
}

/* تحويل المقاطع الصوتية إلى نص للنماذج التي لا تفهم الصوت مباشرة (Whisper) */
async function transcribeAudioAttachments() {
  const caps = getProvider(state.providerId)?.caps || {};
  if (caps.audioIn) return;
  const audios = state.attachments.filter((a) => a.kind === 'audio' && !a.text);
  if (!audios.length) return;
  const keys = await getKeys();
  const sttProvider = ['openai', 'groq'].find((id) => keys[id]);
  if (!sttProvider) {
    toast('النموذج المختار لا يفهم الصوت — أضف مفتاح OpenAI أو Groq لتحويله لنص', 6000);
    return;
  }
  for (const a of audios) {
    try {
      toast('جارٍ تحويل الصوت إلى نص…');
      const blob = await attachmentBlob(a);
      if (!blob) continue;
      const { text } = await transcribe({ providerId: sttProvider, blob, filename: a.name || 'voice.webm' });
      a.text = `(نص التسجيل الصوتي) ${text}`;
      a.transcribed = true;
    } catch (e) { toast('تعذّر تحويل الصوت: ' + e.message, 5000); }
  }
}

export async function sendMessage() {
  if (state.streaming) { toast('انتظر انتهاء الرد الحالي'); return; }
  const input = $('#input');
  const text = input.value.trim();
  if (!text && !state.attachments.length) return;
  if (!state.current) await newChat();

  const agent = agentFor(state.current);
  const providerId = agent?.providerId || state.providerId;
  const model = agent?.model || state.model;
  if (!providerId || !model) { toast('اختر مزوّدًا وموديلًا أولًا'); return; }

  // تجهيز المرفقات (تأكد من وجود البيانات)
  for (const a of state.attachments) {
    if (!a.dataUrl && a.assetId) await attachmentDataUrl(a);
  }
  await transcribeAudioAttachments();
  const parts = [];
  if (text) parts.push({ type: 'text', text });
  parts.push(...partsFromAttachments());

  const userMsg = await Messages.add({ conversationId: state.current.id, role: 'user', content: parts });
  state.messages.push(userMsg);
  state.attachments = [];
  input.value = '';
  autoResize(input);
  renderAttachments();
  state.toolSteps = [];
  renderToolLog();
  renderMessages();
  scrollMessages();

  // اسم المحادثة التلقائي
  if (state.settings.autoTitle && (state.current.title === 'محادثة جديدة' || !state.current.title) && text) {
    const title = clampText(text, 42);
    await Conversations.update(state.current.id, { title });
    state.current.title = title;
    const i = state.conversations.findIndex((c) => c.id === state.current.id);
    if (i >= 0) state.conversations[i].title = title;
    renderConversations();
    $('#topbarTitle').textContent = title;
  }

  await runTurn({ providerId, model, agent });
}

/* ============================ تنفيذ الدور (بث مباشر + أدوات) ============================ */
function setStreamingUI(on) {
  state.streaming = on;
  $('#sendBtn').hidden = on;
  $('#stopBtn').hidden = !on;
}

function startStreamBubble() {
  const box = $('#messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = 'streamingMsg';
  div.innerHTML = `<div class="avatar">🤖</div>
    <div class="bubble">
      <div class="stream-text"></div>
      <div class="typing"><i></i><i></i><i></i></div>
    </div>`;
  box.appendChild(div);
  return div;
}

async function runTurn({ providerId, model, agent }) {
  setStreamingUI(true);
  state.controller = new AbortController();
  state.toolSteps = [];
  renderToolLog();

  const tools = agent?.tools?.length
    ? agent.tools.map((n) => TOOL_DEFS.find((t) => t.name === n)).filter(Boolean)
    : (state.settings.agentsEnabled !== false ? defaultTools(providerId) : []);
  const system = systemFor(agent);
  const history = buildApiHistory();
  const images = [];
  const toolSteps = [];
  let allText = '';
  let roundText = '';

  const bubble = startStreamBubble();
  const textEl = bubble.querySelector('.stream-text');
  const typing = bubble.querySelector('.typing');
  const paint = () => {
    const full = (allText + (allText && roundText ? '\n\n' : '') + roundText);
    textEl.innerHTML = full ? renderMarkdown(full) : '';
    $('#messages').scrollTop = $('#messages').scrollHeight;
  };

  let result = null;
  let failure = null;
  try {
    result = await runAgentLoop({
      providerId, model, system, history,
      tools,
      temperature: typeof agent?.temperature === 'number' ? agent.temperature : state.settings.temperature,
      maxTokens: state.settings.maxTokens,
      signal: state.controller.signal,
      onRoundStart: (round) => {
        if (round > 0) { allText += (allText && roundText ? '\n\n' : '') + roundText; roundText = ''; }
        typing.hidden = false;
      },
      onDelta: (_piece, full, extra) => {
        if (extra?.inline?.dataUrl) {
          const part = { type: 'image', dataUrl: extra.inline.dataUrl, mime: extra.inline.mime || 'image/png', name: 'generated.png', icon: '🖼️' };
          images.push(part);
          bubble.querySelector('.bubble').insertAdjacentHTML('beforeend', `<div class="msg-media"><img class="md-img" src="${part.dataUrl}" alt="صورة مولّدة" /></div>`);
          $('#messages').scrollTop = $('#messages').scrollHeight;
          return;
        }
        roundText = full || roundText;
        typing.hidden = true;
        paint();
      },
      onToolStep: (s) => {
        if (s.phase === 'start') { toolSteps.push({ name: s.name, summary: '⏳ جارٍ التنفيذ…' }); }
        else if (s.phase === 'end') { /* تُحدَّث عبر onStep */ }
        else if (s.summary !== undefined) {
          const last = toolSteps[toolSteps.length - 1];
          if (last && last.name === s.name && last.summary === '⏳ جارٍ التنفيذ…') last.summary = s.summary;
          else toolSteps.push({ name: s.name, summary: s.summary });
        }
        state.toolSteps = toolSteps;
        renderToolLog();
      },
      ctx: {
        providerId, model,
        imageProvider: state.settings.imageProvider || providerId,
        conversationId: state.current?.id,
        attachments: state.messages.flatMap((m) => (m.content || []).filter((p) => p.type !== 'text')),
        onImage: (img) => {
          images.push({ type: 'image', dataUrl: img.dataUrl, mime: img.mime, name: img.name, assetId: img.id, icon: '🖼️' });
          bubble.querySelector('.bubble').insertAdjacentHTML('beforeend', `<div class="msg-media"><img class="md-img" src="${img.dataUrl}" alt="صورة مولّدة" /></div>`);
        },
        onArtifact: (art) => {
          state.artifacts.unshift(art);
          bubble.querySelector('.bubble').insertAdjacentHTML('beforeend', `<div class="code-actions"><span class="badge ok">🧪 ${esc(art.title)} جاهز في المعاينة</span></div>`);
          toast('أضاف الوكيل كودًا جديدًا في صفحة المعاينة');
        },
        onFile: (f) => {
          bubble.querySelector('.bubble').insertAdjacentHTML('beforeend', `<span class="file-chip">📄 ${esc(f.name)} <small>${bytes(f.size)}</small></span>`);
        },
      },
    });
    allText = (allText + (allText && roundText ? '\n\n' : '') + roundText).trim() || (result.text || '').trim();
  } catch (e) {
    failure = e;
    if (e.name === 'AbortError' || /aborted|إلغاء/i.test(e.message || '')) failure = null;
  } finally {
    setStreamingUI(false);
    state.controller = null;
    bubble.remove();
    typing.hidden = true;
  }

  const finalText = (result?.text || allText || '').trim();
  const content = [];
  if (finalText) content.push({ type: 'text', text: finalText });
  content.push(...images);

  if (failure) {
    content.push({ type: 'text', text: (content.length ? '\n\n---\n' : '') + '⚠️ **تعذّر إكمال الطلب**\n\n' + (failure.message || String(failure)) });
  } else if (!content.length) {
    content.push({ type: 'text', text: '(لم يصل رد)' });
  }

  const saved = await Messages.add({
    conversationId: state.current.id,
    role: 'assistant',
    content,
    meta: { providerId, model, usage: result?.usage || null, agentId: agent?.id || '', toolSteps, truncated: !!result?.truncated },
  });
  state.messages.push(saved);
  state.toolSteps = toolSteps;
  renderToolLog();
  renderMessages();
  scrollMessages();
  await Conversations.touch(state.current.id);

  if (state.settings.speakReplies && finalText) { try { speak(finalText); } catch {} }
  if (failure) toast('حدث خطأ — راجع الرسالة', 5000);
}

/* ============================ الوكلاء (Agents) ============================ */
const BUILTIN_AGENTS = [
  {
    id: 'ag_general', name: 'مساعد عام', emoji: '🤖', builtin: true, temperature: 0.6,
    system: 'أنت مساعد ذكي متعدد المهارات. استخدم الأدوات المتاحة عند الحاجة (حسابات، تنفيذ كود، تذكّر معلومات). أجب بإيجاز ووضوح بنفس لغة المستخدم.',
    tools: ['calculator', 'run_javascript', 'current_datetime', 'remember', 'recall'],
  },
  {
    id: 'ag_coder', name: 'مبرمج محترف', emoji: '💻', builtin: true, temperature: 0.3,
    system: 'أنت مهندس برمجيات خبير. اكتب كودًا كاملًا وقابلًا للتشغيل، واشرح باختصار. عندما تكتب واجهة أو لعبة أو تطبيق ويب استخدم أداة create_preview لتحفظ الكود في صفحة المعاينة ليشغّله المستخدم فورًا. اختبر منطق الكود بأداة run_javascript قبل الرد.',
    tools: ['run_javascript', 'create_preview', 'write_file', 'read_file', 'calculator', 'fetch_url', 'current_datetime'],
  },
  {
    id: 'ag_researcher', name: 'باحث ويب', emoji: '🔎', builtin: true, temperature: 0.4,
    system: 'أنت باحث دقيق. ابحث في الويب، ثم اجلب تفاصيل الصفحات المهمة، ولخّص النتائج مع ذكر المصادر (روابط). لا تخترع معلومات.',
    tools: ['web_search', 'fetch_url', 'remember', 'recall', 'current_datetime'],
  },
  {
    id: 'ag_artist', name: 'مصمم صور', emoji: '🎨', builtin: true, temperature: 0.8,
    system: 'أنت مصمم مبدع. حوّل أفكار المستخدم إلى أوصاف صور احترافية بالإنجليزية ثم استخدم أداة generate_image لتوليد الصورة وعرضها له.',
    tools: ['generate_image', 'create_preview', 'current_datetime'],
  },
  {
    id: 'ag_analyst', name: 'محلل بيانات', emoji: '📊', builtin: true, temperature: 0.3,
    system: 'أنت محلل بيانات. اقرأ الملفات المرفقة، وحلّل الأرقام باستخدام run_javascript، واعرض النتائج في جداول Markdown، وأنشئ ملفات التقارير عند الحاجة.',
    tools: ['read_file', 'run_javascript', 'calculator', 'write_file', 'current_datetime'],
  },
];

export async function seedAgents() {
  let list = await Agents.list();
  const ids = new Set(list.map((a) => a.id));
  const missing = BUILTIN_AGENTS.filter((a) => !ids.has(a.id));
  if (missing.length) {
    list = [...missing, ...list];
    await Agents.save(list);
  }
  state.agents = list;
}

export function renderAgents() {
  const view = $('#view-agents');
  view.innerHTML = `
    <div class="section">
      <h2>🤖 الوكلاء (AI Agents)</h2>
      <p class="sub">الوكيل = نموذج + تعليمات (System Prompt) + أدوات يستخدمها بنفسه (تنفيذ كود، بحث، توليد صور، إنشاء ملفات، ومعاينة). اختر وكيلًا من أعلى المحادثة وسيعمل تلقائيًا.</p>
      <button class="btn primary" id="addAgent">＋ وكيل جديد</button>
      <button class="btn" id="resetAgents">↺ استعادة الوكلاء الجاهزين</button>
    </div>
    <div id="agentList"></div>
  `;
  const list = $('#agentList');
  list.innerHTML = state.agents.length ? state.agents.map((a) => `
    <div class="list-item">
      <div style="font-size:26px">${a.emoji}</div>
      <div class="li-main">
        <b>${esc(a.name)} ${a.builtin ? '<span class="badge">جاهز</span>' : ''}</b>
        <small>${esc((a.system || '').slice(0, 110)) || 'بدون تعليمات'}</small>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          ${(a.tools || []).map((t) => `<span class="badge">${esc(TOOL_DEFS.find((x) => x.name === t)?.label || t)}</span>`).join('') || '<span class="badge no">بدون أدوات</span>'}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn sm primary" data-use="${a.id}">استخدام</button>
        <button class="btn sm" data-edit="${a.id}">تعديل</button>
        <button class="btn sm danger" data-del="${a.id}">حذف</button>
      </div>
    </div>`).join('') : '<div class="empty">لا يوجد وكلاء بعد</div>';

  $('#addAgent').onclick = () => agentModal(null);
  $('#resetAgents').onclick = async () => { await Agents.save([]); await seedAgents(); renderAgents(); toast('تم استعادة الوكلاء الجاهزين'); };
  list.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = async () => {
      const agent = state.agents.find((a) => a.id === b.dataset.use);
      const conv = await newChat({ agentId: agent.id, providerId: agent.providerId || state.providerId, model: agent.model || state.model, title: `${agent.name}` });
      renderChatHead();
      toast(`بدأت محادثة مع «${agent.name}»`);
    };
  });
  list.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => agentModal(state.agents.find((a) => a.id === b.dataset.edit)); });
  list.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => { await Agents.remove(b.dataset.del); state.agents = await Agents.list(); renderAgents(); toast('تم الحذف'); };
  });
}

async function agentModal(agent) {
  const isNew = !agent;
  const a = agent || { name: '', emoji: '🤖', system: '', tools: [], temperature: 0.4, providerId: '', model: '' };
  const avail = await availableProviders();
  const provList = avail.length ? avail : PROVIDERS;
  const body = `
    <div class="row">
      <div class="field" style="max-width:110px"><label>الرمز</label><input id="agEmoji" value="${esc(a.emoji)}" /></div>
      <div class="field"><label>الاسم</label><input id="agName" value="${esc(a.name)}" placeholder="مثال: مدرّس رياضيات" /></div>
    </div>
    <div class="field"><label>التعليمات (System Prompt)</label><textarea id="agSystem" rows="5" placeholder="أنت مساعد متخصص في…">${esc(a.system)}</textarea></div>
    <div class="row">
      <div class="field"><label>المزوّد (اختياري)</label><select id="agProvider"><option value="">— الافتراضي —</option>${provList.map((p) => `<option value="${p.id}" ${a.providerId === p.id ? 'selected' : ''}>${p.emoji} ${esc(p.label)}</option>`).join('')}</select></div>
      <div class="field"><label>الموديل (اختياري)</label><input id="agModel" value="${esc(a.model)}" placeholder="gpt-4o" /></div>
      <div class="field" style="max-width:130px"><label>الإبداع</label><input id="agTemp" type="number" step="0.1" min="0" max="2" value="${a.temperature}" /></div>
    </div>
    <div class="field"><label>الأدوات المسموح بها</label><div id="agTools" style="display:grid;gap:6px">
      ${TOOL_DEFS.map((t) => `<label class="switch"><input type="checkbox" value="${t.name}" ${(a.tools || []).includes(t.name) ? 'checked' : ''} /> <span><b>${esc(t.label)}</b><br><small style="color:var(--txt-faint)">${esc(t.description)}</small></span></label>`).join('')}
    </div></div>
  `;
  openModal({
    title: isNew ? 'وكيل جديد' : 'تعديل الوكيل',
    body,
    actions: [
      { label: 'إلغاء', onClick: closeModal },
      { label: 'حفظ', className: 'primary', onClick: async () => {
        const tools = $$('#agTools input:checked').map((i) => i.value);
        const data = {
          name: $('#agName').value.trim() || 'وكيل جديد',
          emoji: $('#agEmoji').value.trim() || '🤖',
          system: $('#agSystem').value.trim(),
          providerId: $('#agProvider').value,
          model: $('#agModel').value.trim(),
          temperature: Number($('#agTemp').value) || 0.4,
          tools,
        };
        if (isNew) await Agents.add(data);
        else await Agents.update(agent.id, data);
        state.agents = await Agents.list();
        renderAgents();
        closeModal();
        toast('تم الحفظ');
      } },
    ],
  });
}

/* ============================ صفحة المعاينة (Preview) ============================ */
let previewLogs = [];
let previewRunnerOff = null;

export async function renderPreview() {
  const view = $('#view-preview');
  if (!state.artifacts.length) state.artifacts = await Artifacts.list();
  const cur = state.artifacts.find((a) => a.id === state.previewId) || state.artifacts[0] || null;
  state.previewId = cur?.id || '';

  view.innerHTML = `
    <div class="section">
      <h2>🧪 صفحة المعاينة</h2>
      <p class="sub">هنا تُشغَّل الأكواد التي يكتبها لك الذكاء الاصطناعي (HTML/CSS/JavaScript) داخل إطار معزول وآمن، وتشاهد المخرجات والأخطاء مباشرة.</p>
      <div class="row">
        <button class="btn primary" id="runArt">▶️ تشغيل</button>
        <button class="btn" id="stopArt">⏹ إيقاف</button>
        <button class="btn" id="newArt">＋ كود جديد</button>
        <button class="btn" id="saveArt">💾 حفظ التعديلات</button>
        <button class="btn" id="dlArt">⬇️ تنزيل</button>
        <button class="btn danger" id="delArt">🗑 حذف</button>
        <label class="switch"><input type="checkbox" id="autoRun" ${state.settings.autoRunPreview ? 'checked' : ''} /> تشغيل تلقائي</label>
      </div>
    </div>
    <div class="pv-split">
      <div class="pv-frame-box">
        <div class="pv-toolbar">
          <b id="pvTitle" style="flex:1">${cur ? esc(cur.title) : 'لا يوجد كود'}</b>
          <span class="badge" id="pvLang">${cur ? esc(langLabel(cur.lang)) : '—'}</span>
          <button class="btn sm" id="clearLog">🧹 السجل</button>
        </div>
        <iframe class="pv-frame" id="pvFrame" title="معاينة الكود"></iframe>
        <div class="pv-log" id="pvLog">سجل التشغيل سيظهر هنا…</div>
      </div>
      <div>
        <div class="section" style="margin-bottom:12px">
          <div class="field"><label>الكود</label><textarea class="pv-code" id="pvCode" spellcheck="false" placeholder="الصق كود HTML أو JavaScript هنا…">${cur ? esc(cur.code) : ''}</textarea></div>
          <div class="row">
            <div class="field" style="max-width:220px"><label>اللغة</label>
              <select id="pvLangSel">
                ${['html', 'js', 'css', 'svg'].map((l) => `<option value="${l}" ${cur?.lang === l ? 'selected' : ''}>${langLabel(l)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>اسم المشروع</label><input id="pvName" value="${cur ? esc(cur.title) : ''}" /></div>
          </div>
        </div>
        <div class="section">
          <h2>📂 مشاريعي (${state.artifacts.length})</h2>
          <div id="artList"></div>
        </div>
      </div>
    </div>
  `;

  renderArtifactList();
  if (previewRunnerOff) previewRunnerOff();
  previewRunnerOff = attachRunner($('#pvFrame'), {
    onLog: (l) => {
      previewLogs.push(l);
      if (previewLogs.length > 300) previewLogs = previewLogs.slice(-300);
      const box = $('#pvLog');
      if (box) box.textContent = previewLogs.map((x) => (x.type === 'error' ? '❌ ' : x.type === 'warn' ? '⚠️ ' : '› ') + x.text).join('\n');
      if (box) box.scrollTop = box.scrollHeight;
    },
  });

  $('#runArt').onclick = () => runCurrent();
  $('#stopArt').onclick = () => { stopFrame($('#pvFrame')); toast('تم الإيقاف'); };
  $('#clearLog').onclick = () => { previewLogs = []; $('#pvLog').textContent = 'سجل التشغيل سيظهر هنا…'; };
  $('#autoRun').onchange = async (e) => { await setSetting('autoRunPreview', e.target.checked); };
  $('#newArt').onclick = () => newArtifactModal();
  $('#saveArt').onclick = saveCurrentArtifact;
  $('#dlArt').onclick = () => {
    const cur = state.artifacts.find((a) => a.id === state.previewId);
    if (!cur) return toast('لا يوجد كود');
    download(artifactFileName(cur), artifactToHtmlFile(cur), 'text/html;charset=utf-8');
  };
  $('#delArt').onclick = async () => {
    const cur = state.artifacts.find((a) => a.id === state.previewId);
    if (!cur) return toast('لا يوجد كود');
    await Artifacts.remove(cur.id);
    state.artifacts = await Artifacts.list();
    state.previewId = state.artifacts[0]?.id || '';
    renderPreview();
    toast('تم الحذف');
  };
  $('#pvCode').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCurrent(); }
  });

  if (cur && state.settings.autoRunPreview) runCurrent();
}

function renderArtifactList() {
  const box = $('#artList');
  if (!box) return;
  if (!state.artifacts.length) { box.innerHTML = '<div class="empty">لا توجد أكواد بعد. اطلب من النموذج كتابة كود، أو أضف كودًا يدويًا.</div>'; return; }
  box.innerHTML = state.artifacts.map((a) => `
    <div class="list-item art-item" data-art="${a.id}" style="${a.id === state.previewId ? 'border-color:var(--acc)' : ''}">
      <div style="font-size:20px">${a.kind === 'web' ? '🌐' : '📜'}</div>
      <div class="li-main"><b>${esc(a.title)}</b><small>${esc(langLabel(a.lang))} • ${fmtTime(a.createdAt)}</small></div>
      <button class="btn sm" data-open="${a.id}">فتح</button>
    </div>`).join('');
  box.querySelectorAll('[data-art]').forEach((el) => {
    el.onclick = () => selectArtifact(el.dataset.art);
  });
}

export function selectArtifact(id) {
  state.previewId = id;
  const a = state.artifacts.find((x) => x.id === id);
  if (!a) return;
  $('#pvTitle').textContent = a.title;
  $('#pvLang').textContent = langLabel(a.lang);
  $('#pvCode').value = a.code;
  $('#pvName').value = a.title;
  $('#pvLangSel').value = a.lang;
  renderArtifactList();
  runCurrent();
}

function runCurrent() {
  const cur = state.artifacts.find((a) => a.id === state.previewId);
  const code = $('#pvCode')?.value || '';
  const lang = $('#pvLangSel')?.value || cur?.lang || 'html';
  if (!code.trim()) { toast('لا يوجد كود للتشغيل'); return; }
  previewLogs = [];
  $('#pvLog').textContent = 'جارٍ التشغيل…';
  runInFrame($('#pvFrame'), { lang, code });
}

async function saveCurrentArtifact() {
  const cur = state.artifacts.find((a) => a.id === state.previewId);
  if (!cur) return;
  const patch = { code: $('#pvCode').value, title: $('#pvName').value.trim() || cur.title, lang: $('#pvLangSel').value };
  await Artifacts.remove(cur.id);
  const rec = await Artifacts.add({ ...cur, ...patch, id: cur.id });
  state.artifacts = await Artifacts.list();
  renderArtifactList();
  $('#pvTitle').textContent = rec.title;
  $('#pvLang').textContent = langLabel(rec.lang);
  toast('تم حفظ التعديلات');
}

function newArtifactModal() {
  openModal({
    title: 'كود جديد',
    body: `<div class="field"><label>الاسم</label><input id="naName" placeholder="مشروعي" /></div>
      <div class="field"><label>اللغة</label><select id="naLang"><option value="html">HTML</option><option value="js">JavaScript</option><option value="css">CSS</option><option value="svg">SVG</option></select></div>
      <div class="field"><label>الكود</label><textarea class="pv-code" id="naCode" rows="10" placeholder="<!DOCTYPE html>…"></textarea></div>`,
    actions: [
      { label: 'إلغاء', onClick: closeModal },
      { label: 'إضافة', className: 'primary', onClick: async () => {
        const rec = await Artifacts.add({ title: $('#naName').value.trim() || 'كود جديد', lang: $('#naLang').value, code: $('#naCode').value, kind: 'web' });
        state.artifacts = await Artifacts.list();
        state.previewId = rec.id;
        closeModal();
        renderPreview();
        toast('تمت الإضافة');
      } },
    ],
  });
}

/* ============================ الإعدادات ============================ */
async function renderSettings() {
  const view = $('#view-settings');
  const keys = (await Settings.get('apiKeys', {})) || {};
  const baseUrls = (await Settings.get('baseUrls', {})) || {};
  const est = await storageEstimate();
  const memory = state.settings.memory || [];
  const search = state.settings.searchKeys || {};

  view.innerHTML = `
    <div class="section">
      <h2>🔑 مفاتيح API</h2>
      <p class="sub">تُخزَّن المفاتيح في جهازك فقط (IndexedDB) ولا تُرسل لأي سيرفر غير مزوّدك. أنت تستخدم مفاتيحك المدفوعة مباشرة.</p>
      <div id="keyRows"></div>
      <button class="btn primary block" id="saveKeys" style="margin-top:10px">💾 حفظ كل المفاتيح</button>
    </div>

    <div class="section">
      <h2>⚙️ الافتراضيات</h2>
      <p class="sub">ما يُستخدم في المحادثات الجديدة.</p>
      <div class="row">
        <div class="field"><label>المزوّد الافتراضي</label><select id="defProvider">${PROVIDERS.map((p) => `<option value="${p.id}" ${state.settings.defaultProvider === p.id ? 'selected' : ''}>${p.emoji} ${esc(p.label)}</option>`).join('')}</select></div>
        <div class="field"><label>الموديل الافتراضي</label><input id="defModel" value="${esc(state.settings.defaultModel)}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>أقصى عدد رموز للرد</label><input id="maxTokens" type="number" min="256" step="256" value="${state.settings.maxTokens}" /></div>
        <div class="field"><label>درجة الإبداع (Temperature)</label><input id="temperature" type="number" min="0" max="2" step="0.1" value="${state.settings.temperature}" /></div>
      </div>
      <div class="field"><label>تعليمات النظام (System Prompt) الافتراضية</label><textarea id="sysPrompt" rows="4">${esc(state.settings.systemPrompt)}</textarea></div>
      <label class="switch"><input type="checkbox" id="autoTitle" ${state.settings.autoTitle ? 'checked' : ''} /> تسمية المحادثات تلقائيًا من أول رسالة</label>
      <label class="switch"><input type="checkbox" id="agentsEnabled" ${state.settings.agentsEnabled !== false ? 'checked' : ''} /> 🛠 تمكين أدوات الوكلاء تلقائيًا لكل النماذج (تنفيذ كود، بحث، توليد صور، ملفات، ذاكرة)</label>
      <label class="switch"><input type="checkbox" id="speakReplies" ${state.settings.speakReplies ? 'checked' : ''} /> قراءة الردود صوتيًا تلقائيًا</label>
      <label class="switch"><input type="checkbox" id="darkMode" ${state.settings.theme !== 'light' ? 'checked' : ''} /> الوضع الليلي</label>
      <button class="btn primary" id="saveDefaults" style="margin-top:12px">💾 حفظ الإعدادات</button>
    </div>

    <div class="section">
      <h2>🛠 أدوات الوكلاء</h2>
      <p class="sub">البحث في الويب وجلب الصفحات يحتاجان مفتاحًا أو بروكسي. أدوات تنفيذ الكود والصورة والملفات تعمل بدون أي إعداد إضافي.</p>
      <div class="field"><label>مفتاح Tavily (بحث في الويب)</label><input id="tavilyKey" dir="ltr" placeholder="tvly-…" value="${esc(search.tavily || '')}" /><div class="hint">مجاني جزئيًا من tavily.com — أفضل جودة للبحث.</div></div>
      <div class="field"><label>مفتاح Brave Search (بديل)</label><input id="braveKey" dir="ltr" placeholder="…" value="${esc(search.brave || '')}" /></div>
      <div class="field"><label>بروكسي جلب الصفحات (لتجاوز قيود CORS)</label><input id="fetchProxy" dir="ltr" value="${esc(state.settings.fetchProxy || '')}" /><div class="hint">الافتراضي r.jina.ai يحوّل الصفحات لنص. اتركه فارغًا للجلب المباشر.</div></div>
      <button class="btn primary" id="saveTools">💾 حفظ أدوات الوكلاء</button>
    </div>

    <div class="section">
      <h2>🧠 ذاكرة المساعد (${memory.length})</h2>
      <p class="sub">معلومات يحفظها الوكيل عنك عبر أداة «تذكّر».</p>
      <div id="memList">${memory.length ? memory.map((m, i) => `<div class="kv"><span>${esc(m)}</span><button class="btn sm danger" data-mem-del="${i}">حذف</button></div>`).join('') : '<div class="empty">لا توجد معلومات محفوظة</div>'}</div>
      ${memory.length ? '<button class="btn danger" id="clearMem" style="margin-top:10px">مسح كل الذاكرة</button>' : ''}
    </div>

    <div class="section">
      <h2>💾 بياناتك على هذا الجهاز</h2>
      <p class="sub">كل شيء محفوظ محليًا: المحادثات، الملفات، الأكواد. لا يوجد سيرفر وسيط.</p>
      <div class="kv"><span>المحادثات</span><b>${state.conversations.length}</b></div>
      <div class="kv"><span>المشاريع (أكواد)</span><b>${state.artifacts.length}</b></div>
      <div class="kv"><span>المساحة المستخدمة</span><b>${est ? bytes(est.usage || 0) : 'غير معروف'}</b></div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="exportBtn2">⬇️ تصدير نسخة احتياطية</button>
        <button class="btn" id="importBtn">⬆️ استيراد نسخة</button>
        <input type="file" id="importFile" accept="application/json" hidden />
        <button class="btn" id="persistBtn">🔒 تثبيت التخزين</button>
        <button class="btn danger" id="wipeBtn">🗑 مسح كل البيانات</button>
      </div>
    </div>
  `;

  // صفوف المفاتيح
  $('#keyRows').innerHTML = PROVIDERS.map((p) => `
    <div class="key-row">
      <div class="kr-info"><b>${p.emoji} ${esc(p.label)}</b><small>${esc(p.note || '')}${p.noKey ? ' — لا يحتاج مفتاحًا' : ''}</small></div>
      ${p.noKey ? '<span class="badge ok">بدون مفتاح</span>' : `<input type="password" data-key="${p.id}" placeholder="الصق المفتاح هنا…" value="${esc(keys[p.id] || '')}" autocomplete="off" />`}
      <input type="text" data-base="${p.id}" placeholder="Base URL" value="${esc(baseUrls[p.id] || p.baseUrl || '')}" style="flex:1.2" />
      ${p.noKey ? '' : `<button class="btn sm" data-test="${p.id}">اختبار</button>`}
      ${p.keyUrl ? `<a class="btn sm" href="${p.keyUrl}" target="_blank" rel="noopener">الحصول على مفتاح</a>` : ''}
    </div>`).join('');

  $('#saveKeys').onclick = saveKeys;
  view.querySelectorAll('[data-test]').forEach((b) => {
    b.onclick = async () => {
      await saveKeys(true);
      const id = b.dataset.test;
      b.textContent = '…';
      const r = await testConnection(id);
      b.textContent = 'اختبار';
      openModal({
        title: `اختبار ${getProvider(id)?.label || id}`,
        body: r.ok ? `<p class="badge ok">✅ الاتصال ناجح</p><p>ردّ الموديل: <b>${esc(r.text)}</b></p>` : `<p class="badge no">❌ فشل الاتصال</p><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${esc(r.error)}</pre>`,
        actions: [{ label: 'تم', className: 'primary', onClick: closeModal }],
      });
    };
  });

  $('#saveDefaults').onclick = async () => {
    await Settings.merge({
      defaultProvider: $('#defProvider').value,
      defaultModel: $('#defModel').value.trim(),
      maxTokens: Number($('#maxTokens').value) || 4096,
      temperature: Number($('#temperature').value),
      systemPrompt: $('#sysPrompt').value,
      autoTitle: $('#autoTitle').checked,
      speakReplies: $('#speakReplies').checked,
      agentsEnabled: $('#agentsEnabled').checked,
      theme: $('#darkMode').checked ? 'dark' : 'light',
    });
    state.settings = { ...state.settings, ...(await Settings.all()) };
    applyTheme(state.settings.theme);
    toast('تم حفظ الإعدادات');
  };

  $('#saveTools').onclick = async () => {
    await Settings.merge({ searchKeys: { tavily: $('#tavilyKey').value.trim(), brave: $('#braveKey').value.trim() }, fetchProxy: $('#fetchProxy').value.trim() });
    state.settings = { ...state.settings, ...(await Settings.all()) };
    toast('تم حفظ أدوات الوكلاء');
  };

  view.querySelectorAll('[data-mem-del]').forEach((b) => {
    b.onclick = async () => {
      const list = [...(state.settings.memory || [])];
      list.splice(Number(b.dataset.memDel), 1);
      await setSetting('memory', list);
      renderSettings();
    };
  });
  const cm = $('#clearMem');
  if (cm) cm.onclick = async () => { await setSetting('memory', []); renderSettings(); toast('تم مسح الذاكرة'); };

  $('#exportBtn2').onclick = doExport;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = doImport;
  $('#persistBtn').onclick = async () => { const ok = await askPersistent(); toast(ok ? 'تم تثبيت التخزين — بياناتك محمية من الحذف التلقائي' : 'المتصفح لم يمنح تثبيت التخزين'); };
  $('#wipeBtn').onclick = confirmWipe;
}

async function saveKeys(silent = false) {
  const keys = { ...((await Settings.get('apiKeys', {})) || {}) };
  $$('[data-key]').forEach((i) => {
    const v = i.value.trim();
    if (v) keys[i.dataset.key] = v; else delete keys[i.dataset.key];
  });
  const baseUrls = { ...((await Settings.get('baseUrls', {})) || {}) };
  $$('[data-base]').forEach((i) => {
    const p = getProvider(i.dataset.base);
    const v = i.value.trim();
    if (v && v !== p?.baseUrl) baseUrls[i.dataset.base] = v; else delete baseUrls[i.dataset.base];
  });
  await Settings.merge({ apiKeys: keys, baseUrls });
  state.settings = { ...state.settings, ...(await Settings.all()) };
  if (!silent) toast('تم حفظ المفاتيح');
}

/* ============================ تصدير/استيراد/مسح ============================ */
async function doExport() {
  const data = await DB.exportAll();
  download(`mosaaidi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('تم إنشاء النسخة الاحتياطية (بدون المفاتيح)');
}

async function doImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const n = await DB.importAll(data, { withKeys: false });
    await loadConversations();
    state.artifacts = await Artifacts.list();
    toast(`تم استيراد ${n} محادثة`);
  } catch (err) { toast('فشل الاستيراد: ' + err.message, 5000); }
  e.target.value = '';
}

function confirmWipe() {
  openModal({
    title: 'مسح كل البيانات',
    body: '<p>سيتم حذف كل المحادثات والملفات والأكواد والمفاتيح من هذا الجهاز. لا يمكن التراجع.</p>',
    actions: [
      { label: 'إلغاء', onClick: closeModal },
      { label: 'مسح الكل', className: 'danger', onClick: async () => {
        await DB.clearAll();
        await Settings.set('memory', []);
        state.conversations = []; state.messages = []; state.current = null; state.artifacts = []; state.attachments = [];
        await loadConversations();
        closeModal();
        goto('chats');
        toast('تم مسح كل البيانات');
      } },
    ],
  });
}

/* ============================ عن التطبيق ============================ */
function renderAbout() {
  $('#view-about').innerHTML = `
    <div class="section">
      <h2>ℹ️ مساعدي — تطبيق ذكاء اصطناعي بمفاتيحك الخاصة</h2>
      <p class="sub">تطبيق ويب (PWA) يعمل على الهاتف والتابلت والكمبيوتر، بدون سيرفر وسيط. أنت تضع مفاتيح API المدفوعة الخاصة بك وتتحدث مع النماذج مباشرة.</p>
      <div class="grid-cards">
        <div class="card"><h3>🔑 مفاتيحك</h3><p>OpenAI، Claude، Gemini، OpenRouter، Groq، DeepSeek، Mistral، xAI، Together، Ollama المحلي، وأي سيرفر متوافق مع OpenAI.</p></div>
        <div class="card"><h3>🎤 متعدد الوسائط</h3><p>أرسل نصًا، تسجيل صوتي، صورًا، فيديو، ملفات و PDF. واستقبل صورًا وردودًا صوتية.</p></div>
        <div class="card"><h3>🤖 وكلاء بأدوات</h3><p>تنفيذ كود، بحث ويب، جلب صفحات، توليد صور، إنشاء ملفات، وذاكرة دائمة.</p></div>
        <div class="card"><h3>🧪 معاينة الأكواد</h3><p>كل كود يكتبه النموذج يمكن تشغيله فورًا داخل التطبيق في بيئة معزولة.</p></div>
        <div class="card"><h3>💾 سجل محلي</h3><p>كل محادثة لها اسم وتُحفظ على جهازك في IndexedDB، مع تصدير واستيراد.</p></div>
        <div class="card"><h3>📴 يعمل كتطبيق</h3><p>من المتصفح: القائمة ← «إضافة إلى الشاشة الرئيسية» ليعمل كتطبيق مستقل.</p></div>
      </div>
    </div>
    <div class="section">
      <h2>🔒 الخصوصية</h2>
      <p class="sub">لا يمر أي شيء عبر سيرفراتنا: طلباتك تذهب مباشرة من جهازك إلى مزوّد الـ API. المفاتيح والملفات تُخزَّن محليًا فقط. لا تنسخ المفاتيح على أجهزة مشتركة، ويمكنك حذف كل شيء من الإعدادات.</p>
    </div>
    <div class="section">
      <h2>💡 نصائح</h2>
      <ul>
        <li>للفيديو والصوت: Gemini الأفضل (يفهم الفيديو والصور والصوت مباشرة).</li>
        <li>للأكواد: Claude أو DeepSeek أو GPT-4.1.</li>
        <li>للسرعة والرخص: Groq أو GPT-4o-mini.</li>
        <li>فعّل «قراءة الردود صوتيًا» من الإعدادات للاستماع للردود.</li>
        <li>في صفحة المعاينة: Ctrl+Enter لتشغيل الكود.</li>
      </ul>
    </div>`;
}

/* ============================ الأحداث ============================ */
function bindEvents() {
  $('#menuBtn').onclick = openDrawer;
  $('#sidebarClose').onclick = closeDrawer;
  $('#scrim').onclick = closeDrawer;
  document.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => goto(b.dataset.goto); });
  document.querySelectorAll('[data-new-chat]').forEach((b) => { b.onclick = () => newChat(); });
  $('#newChatBtn').onclick = () => newChat();
  $('#exportBtn').onclick = doExport;
  $('#themeBtn').onclick = async () => {
    const t = state.settings.theme === 'light' ? 'dark' : 'light';
    await setSetting('theme', t);
    applyTheme(t);
  };
  $('#convSearch').oninput = debounce((e) => { state.search = e.target.value; renderConversations(); }, 180);

  // المُدخَل
  const input = $('#input');
  input.addEventListener('input', () => autoResize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); sendMessage(); }
  });
  $('#composer').onsubmit = (e) => { e.preventDefault(); sendMessage(); };
  $('#attachBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async (e) => { await addFiles([...e.target.files]); e.target.value = ''; };
  $('#cameraBtn').onclick = () => $('#cameraInput').click();
  $('#cameraInput').onchange = async (e) => { await addFiles([...e.target.files]); e.target.value = ''; };
  $('#stopBtn').onclick = () => { state.controller?.abort(); toast('تم إيقاف الرد'); };

  // لصق الصور من الحافظة
  input.addEventListener('paste', async (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); await addFiles(files); }
  });

  // السحب والإفلات
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, async (e) => {
    if (ev === 'dragover') { e.preventDefault(); return; }
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { if (state.view !== 'chat') toast('افتح محادثة أولًا لإرفاق الملفات'); else await addFiles(files); }
  }));

  // تسجيل الصوت
  const recorder = new VoiceRecorder();
  let recording = false;
  $('#recordBtn').onclick = async () => {
    const btn = $('#recordBtn');
    if (!recording) {
      try {
        await recorder.start();
        recording = true;
        btn.classList.add('recording');
        btn.textContent = '⏹';
        toast('جارٍ التسجيل… اضغط ⏹ للإيقاف');
      } catch (e) { toast('تعذّر الوصول للميكروفون: ' + e.message, 5000); }
      return;
    }
    recording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    const out = await recorder.stop();
    if (!out?.blob) return;
    const ext = (out.type || '').includes('mp4') ? 'm4a' : 'webm';
    const file = new File([out.blob], `تسجيل-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`, { type: out.type || 'audio/webm' });
    await addFiles([file]);
    toast('تم إضافة التسجيل الصوتي');
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); closeModal(); stopSpeaking(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); newChat(); }
  });

  window.addEventListener('online', () => toast('عاد الاتصال بالإنترنت'));
  window.addEventListener('offline', () => toast('لا يوجد اتصال — سيعمل التطبيق لكن لن تصل الردود'));
}

/* ============================ بدء التشغيل ============================ */
async function boot() {
  try {
    await loadSettings();
    await seedAgents();
    await loadConversations();
    state.artifacts = await Artifacts.list();
    state.providerId = state.settings.defaultProvider;
    state.model = state.settings.defaultModel;
    bindEvents();
    goto('chats');
    renderChatHead();
  } catch (e) {
    console.error(e);
    toast('حدث خطأ أثناء التشغيل: ' + e.message, 6000);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

/* متاح للاختبار من الكونسول */
window.mosaaidi = { state, goto, newChat, sendMessage, renderSettings };
