/* util.js — أدوات مساعدة عامة */

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function clampText(s, n = 60) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function bytes(n) {
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const t = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return t;
    return `${d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' })} ${t}`;
  } catch { return ''; }
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function dataURLToParts(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return { mime: 'application/octet-stream', base64: '' };
  return { mime: m[1] || 'application/octet-stream', base64: m[2] ? m[3] : btoa(decodeURIComponent(m[3])) };
}

export function b64ToBlob(b64, mime = 'application/octet-stream') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}

export const fileIcon = (mime = '', name = '') => {
  const m = mime || ''; const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎧';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (/zip|rar|7z|tar|gz/.test(m + n)) return '🗜️';
  if (/json|javascript|typescript|xml|html|css|python|csv|plain|markdown/.test(m)) return '📄';
  if (/word|document/.test(m + n) || /\.docx?$/.test(n)) return '📝';
  if (/sheet|excel/.test(m + n) || /\.xlsx?$/.test(n)) return '📊';
  return '📎';
};

export const isTextLike = (mime = '', name = '') => {
  const n = (name || '').toLowerCase();
  return (
    (mime || '').startsWith('text/') ||
    /json|xml|javascript|csv|yaml|x-sh|svg\+xml/.test(mime || '') ||
    /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|bash|yml|yaml|toml|ini|env|sql|csv|tsv|log|xml|svg)$/.test(n)
  );
};

export function truncateForPrompt(text, maxChars = 12000) {
  if (text == null) return '';
  text = String(text);
  return text.length <= maxChars ? text : text.slice(0, maxChars) + `\n…[تم قصّ ${text.length - maxChars} حرفًا]`;
}

export function safeJsonParse(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export function pickMimeExt(mime = '') {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'application/pdf': 'pdf' };
  return map[mime] || 'bin';
}
