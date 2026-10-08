/* markdown.js — عارض ماركداون خفيف وآمن (بدون مكتبات خارجية) */

import { esc } from './util.js';
import { runtimeOf, isRunnableLang, runtimeLabel } from './runtimes.js';

const LANG_LABELS = {
  html: 'HTML', xml: 'XML', svg: 'SVG', css: 'CSS', js: 'JavaScript', javascript: 'JavaScript',
  mjs: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
  py: 'Python', python: 'Python', json: 'JSON', bash: 'Shell', sh: 'Shell', shell: 'Shell',
  sql: 'SQL', java: 'Java', c: 'C', cpp: 'C++', cs: 'C#', go: 'Go', rs: 'Rust', php: 'PHP', dart: 'Dart',
};

export const langLabel = (l, code = '') => runtimeLabel(l, code) || LANG_LABELS[(l || '').toLowerCase()] || (l || 'نص');

/* هل يمكن تشغيل هذا الكود في صفحة المعاينة؟ */
export function isRunnable(lang, code = '') {
  return isRunnableLang(lang, code);
}

export function isWebProject(lang, code = '') {
  const rt = runtimeOf(lang, code);
  return rt?.kind === 'web';
}

/* استخراج الأكواد القابلة للتشغيل من نص ردّ النموذج */
export function extractArtifacts(md) {
  const out = [];
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let m;
  let i = 0;
  while ((m = re.exec(md))) {
    i++;
    const lang = (m[1] || '').toLowerCase();
    const code = m[2];
    if (!isRunnable(lang, code)) continue;
    out.push({ lang, code, title: `${langLabel(lang)} #${i}`, kind: isWebProject(lang, code) ? 'web' : 'script' });
  }
  if (!out.length && /<\s*html[\s>]/i.test(md)) out.push({ lang: 'html', code: md, title: 'صفحة HTML', kind: 'web' });
  return out;
}

function inline(text) {
  let s = text;
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|data:[^\s)]+)\)/g,
    (_, alt, url) => `<img class="md-img" src="${url}" alt="${esc(alt)}" loading="lazy" />`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+\.(?:png|jpe?g|gif|webp|svg))(?=$|[\s)])/gi,
    (_, pre, url) => `${pre}<img class="md-img" src="${url}" alt="" loading="lazy" />`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+\.(?:mp4|webm|mov))(?=$|[\s)])/gi,
    (_, pre, url) => `${pre}<video controls preload="metadata" src="${url}"></video>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+\.(?:mp3|wav|ogg|m4a))(?=$|[\s)])/gi,
    (_, pre, url) => `${pre}<audio controls src="${url}"></audio>`);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s;
}

/* فك تشفير HTML للحصول على الكود الأصلي */
export function unescapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function tableToHtml(rows) {
  const cells = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${
    body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}
/* المحوّل الرئيسي */
export function renderMarkdown(md, { onCodeBlock } = {}) {
  if (!md) return '';
  let text = esc(String(md));
  const blocks = [];

  text = text.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
    const idx = blocks.length;
    // code = مُشفَّر للعرض فقط، raw = الكود الحقيقي للتشغيل والنسخ
    blocks.push({ lang: (lang || '').toLowerCase(), code, raw: unescapeHtml(code) });
    return `\u0000BLOCK${idx}\u0000`;
  });

  const lines = text.split('\n');
  const out = [];
  let listType = null;
  let para = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join('<br />'))}</p>`); para = []; } };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^\u0000BLOCK\d+\u0000$/.test(t)) { flushPara(); closeList(); out.push(t); continue; }
    if (!t) { flushPara(); closeList(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { flushPara(); closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); out.push('<hr />'); continue; }

    if (/^>\s?/.test(t)) { flushPara(); closeList(); out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }

    if (/\|/.test(t) && lines[i + 1] && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushPara(); closeList();
      const rows = [t];
      let j = i + 2;
      while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim()) { rows.push(lines[j].trim()); j++; }
      out.push(tableToHtml(rows));
      i = j - 1;
      continue;
    }

    const ul = /^[-*+]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }

    para.push(t);
  }
  flushPara(); closeList();

  let html = out.join('\n');

  html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (_, n) => {
    const b = blocks[Number(n)];
    const rendered = onCodeBlock ? onCodeBlock(b, Number(n)) : null;
    return rendered ?? `<pre><code class="lang-${esc(b.lang)}">${b.code}</code></pre>`;
  });

  return html;
}

/* نص فقط بدون تنسيق */
export function plainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z0-9_+-]*\n?/g, ''))
    .replace(/[*_`>#]/g, '')
    .trim();
}

