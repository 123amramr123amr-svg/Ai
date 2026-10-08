/* db.js — تخزين محلي على الجهاز عبر IndexedDB (بدون أي سيرفر) */

const DB_NAME = 'mosaaidi-db';
const DB_VERSION = 1;

let _db = null;

export function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('IndexedDB غير مدعوم في هذا المتصفح'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('conversations')) {
        const s = db.createObjectStore('conversations', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath: 'id' });
        s.createIndex('conversationId', 'conversationId');
      }
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('artifacts')) {
        const s = db.createObjectStore('artifacts', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => { _db = req.result; _db.onversionchange = () => { _db.close(); _db = null; }; res(_db); };
    req.onerror = () => rej(req.error);
  });
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && out.__req ? out.__req.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }));
}
const wrap = (req) => ({ __req: req });

/* ---------- settings (kv) ---------- */
export const Settings = {
  async get(k, dflt = null) {
    const row = await tx('settings', 'readonly', (s) => wrap(s.get(k)));
    return row ? row.v : dflt;
  },
  async all() {
    const rows = await tx('settings', 'readonly', (s) => wrap(s.getAll()));
    const o = {}; (rows || []).forEach((r) => { o[r.k] = r.v; }); return o;
  },
  set(k, v) { return tx('settings', 'readwrite', (s) => { s.put({ k, v }); }); },
  async merge(obj) {
    await tx('settings', 'readwrite', (s) => { Object.entries(obj).forEach(([k, v]) => s.put({ k, v })); });
  },
  async del(k) { await tx('settings', 'readwrite', (s) => s.delete(k)); },
};

/* ---------- conversations ---------- */
export const Conversations = {
  async create(partial = {}) {
    const now = Date.now();
    const conv = { id: partial.id || 'c_' + now.toString(36) + Math.random().toString(36).slice(2, 6), title: partial.title || 'محادثة جديدة', providerId: partial.providerId || '', model: partial.model || '', agentId: partial.agentId || '', systemPrompt: partial.systemPrompt || '', createdAt: now, updatedAt: now, pinned: !!partial.pinned, archived: false, ...partial };
    await tx('conversations', 'readwrite', (s) => s.put(conv));
    return conv;
  },
  get(id) { return tx('conversations', 'readonly', (s) => wrap(s.get(id))); },
  async list() {
    const rows = await tx('conversations', 'readonly', (s) => wrap(s.getAll()));
    return (rows || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  update(id, patch) {
    return openDb().then((db) => new Promise((res, rej) => {
      const t = db.transaction('conversations', 'readwrite');
      const s = t.objectStore('conversations');
      const g = s.get(id);
      g.onsuccess = () => { const cur = g.result || { id }; s.put({ ...cur, ...patch, id, updatedAt: Date.now() }); };
      t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
    }));
  },
  touch(id) { return Conversations.update(id, {}); },
  remove(id) { return tx('conversations', 'readwrite', (s) => s.delete(id)); },
  clear() { return tx('conversations', 'readwrite', (s) => s.clear()); },
};

/* ---------- messages ---------- */
export const Messages = {
  async add(m) {
    const row = { id: m.id || 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdAt: m.createdAt || Date.now(), ...m };
    await tx('messages', 'readwrite', (s) => s.put(row));
    return row;
  },
  async byConversation(cid) {
    const rows = await tx('messages', 'readonly', (s) => wrap(s.index('conversationId').getAll(cid)));
    return (rows || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },
  update(id, patch) {
    return openDb().then((db) => new Promise((res, rej) => {
      const t = db.transaction('messages', 'readwrite');
      const s = t.objectStore('messages');
      const g = s.get(id);
      g.onsuccess = () => { if (g.result) s.put({ ...g.result, ...patch, id }); };
      t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
    }));
  },
  remove(id) { return tx('messages', 'readwrite', (s) => s.delete(id)); },
  async removeByConversation(cid) {
    const rows = await Messages.byConversation(cid);
    await tx('messages', 'readwrite', (s) => rows.forEach((r) => s.delete(r.id)));
  },
  async all() { return (await tx('messages', 'readonly', (s) => wrap(s.getAll()))) || []; },
  clear() { return tx('messages', 'readwrite', (s) => s.clear()); },
};

/* ---------- assets (ملفات ووسائط محفوظة محليًا) ---------- */
export const Assets = {
  async put(blob, meta = {}) {
    const rec = { id: meta.id || 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: meta.name || 'file', type: meta.type || blob.type || 'application/octet-stream', size: blob.size, blob, createdAt: Date.now(), kind: meta.kind || '' };
    await tx('assets', 'readwrite', (s) => s.put(rec));
    return rec;
  },
  get(id) { return tx('assets', 'readonly', (s) => wrap(s.get(id))); },
  async all() { return (await tx('assets', 'readonly', (s) => wrap(s.getAll()))) || []; },
  remove(id) { return tx('assets', 'readwrite', (s) => s.delete(id)); },
  clear() { return tx('assets', 'readwrite', (s) => s.clear()); },
};

/* ---------- artifacts (أكواد صفحة المعاينة) ---------- */
export const Artifacts = {
  async add(a) {
    const rec = { id: a.id || 'ar_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: a.title || 'كود بدون عنوان', lang: a.lang || 'html', code: a.code || '', kind: a.kind || 'web', conversationId: a.conversationId || '', hash: a.hash || '', auto: !!a.auto, createdAt: Date.now() };
    await tx('artifacts', 'readwrite', (s) => s.put(rec));
    return rec;
  },
  async list() { return ((await tx('artifacts', 'readonly', (s) => wrap(s.getAll()))) || []).sort((a, b) => b.createdAt - a.createdAt); },
  get(id) { return tx('artifacts', 'readonly', (s) => wrap(s.get(id))); },
  remove(id) { return tx('artifacts', 'readwrite', (s) => s.delete(id)); },
  clear() { return tx('artifacts', 'readwrite', (s) => s.clear()); },
};

/* ---------- agents ---------- */
export const Agents = {
  async list() {
    const v = await Settings.get('agents', null);
    return Array.isArray(v) ? v : [];
  },
  async save(list) { await Settings.set('agents', list); return list; },
  async add(a) {
    const list = await Agents.list();
    const rec = { id: 'ag_' + Date.now().toString(36), name: a.name || 'وكيل جديد', emoji: a.emoji || '🤖', system: a.system || '', providerId: a.providerId || '', model: a.model || '', tools: a.tools || [], temperature: a.temperature ?? 0.4, builtin: !!a.builtin, createdAt: Date.now() };
    list.push(rec); await Agents.save(list); return rec;
  },
  async update(id, patch) {
    const list = await Agents.list();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; await Agents.save(list); return list[i]; }
    return null;
  },
  async remove(id) { await Agents.save((await Agents.list()).filter((x) => x.id !== id)); },
};

/* ---------- إدارة كل البيانات ---------- */
export async function clearAll() {
  await Promise.all([Conversations.clear(), Messages.clear(), Assets.clear(), Artifacts.clear()]);
}

export async function exportAll() {
  const [conversations, messages, artifacts, settings, agents] = await Promise.all([
    Conversations.list(), Messages.all(), Artifacts.list(), Settings.all(), Agents.list(),
  ]);
  const safeSettings = { ...settings };
  delete safeSettings.agents;
  delete safeSettings.apiKeys; // المفاتيح لا تُصدَّر افتراضيًا (لتفادي تسريبها)
  return { app: 'mosaaidi', version: 1, exportedAt: new Date().toISOString(), conversations, messages, artifacts, settings: safeSettings, agents };
}

export async function importAll(data, { withKeys = false } = {}) {
  if (!data || data.app !== 'mosaaidi') throw new Error('ملف غير معروف');
  let c = 0;
  for (const conv of data.conversations || []) { await Conversations.create(conv); c++; }
  for (const m of data.messages || []) { await Messages.add(m); }
  for (const a of data.artifacts || []) { await Artifacts.add(a); }
  if (data.agents?.length) {
    const cur = await Agents.list();
    const ids = new Set(cur.map((x) => x.id));
    await Agents.save([...cur, ...data.agents.filter((a) => !ids.has(a.id))]);
  }
  if (data.settings) {
    const s = { ...data.settings };
    if (!withKeys) delete s.apiKeys;
    await Settings.merge(s);
  }
  return c;
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

export async function askPersistent() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}


