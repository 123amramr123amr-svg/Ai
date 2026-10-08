/* runtimes.js — لغات البرمجة التي يمكن تشغيلها في المعاينة
 *
 * kind:
 *   'web'      → يعمل داخل إطار معزول محليًا بدون إنترنت (HTML/CSS/JS/SVG/Markdown/JSON)
 *   'pyodide'  → مفسّر بايثون (WebAssembly) يُحمَّل من الإنترنت أول مرة
 *   'fengari'  → مفسّر لوا (JavaScript) يُحمَّل من الإنترنت أول مرة
 */

export const RUNTIMES = {
  html: { label: 'HTML', kind: 'web', icon: '🌐' },
  htm: { label: 'HTML', kind: 'web', icon: '🌐' },
  css: { label: 'CSS', kind: 'web', icon: '🎨' },
  js: { label: 'JavaScript', kind: 'web', icon: '🟨' },
  javascript: { label: 'JavaScript', kind: 'web', icon: '🟨' },
  mjs: { label: 'JavaScript', kind: 'web', icon: '🟨' },
  jsx: { label: 'JSX', kind: 'web', icon: '⚛️' },
  svg: { label: 'SVG', kind: 'web', icon: '🖼️' },
  xml: { label: 'XML', kind: 'web', icon: '📄' },
  markdown: { label: 'Markdown', kind: 'web', icon: '📝' },
  md: { label: 'Markdown', kind: 'web', icon: '📝' },
  json: { label: 'JSON', kind: 'web', icon: '🔧' },
  python: { label: 'Python', kind: 'pyodide', icon: '🐍', online: true },
  py: { label: 'Python', kind: 'pyodide', icon: '🐍', online: true },
  lua: { label: 'Lua', kind: 'fengari', icon: '🌙', online: true },
};

/* هل يمكن تشغيل هذا الكود؟ */
export function runtimeOf(lang, code = '') {
  const l = String(lang || '').toLowerCase().trim();
  if (RUNTIMES[l]) return RUNTIMES[l];
  if (!l && /<\s*(!doctype|html|body|div|canvas|svg|script)/i.test(code)) return RUNTIMES.html;
  if (!l && /^\s*(def |import |print\()/m.test(code)) return RUNTIMES.python;
  return null;
}

export const isRunnableLang = (lang, code = '') => !!runtimeOf(lang, code);

export const runtimeLabel = (lang, code = '') => runtimeOf(lang, code)?.label || (lang || 'نص');

/* يحتاج إنترنت؟ (مفسّرات WebAssembly تُحمَّل أول مرة فقط ثم تُخزَّن) */
export const needsOnline = (lang, code = '') => !!runtimeOf(lang, code)?.online;

/* اللغات المتاحة (للعرض في الواجهة) */
export const SUPPORTED_LANGS = ['html', 'css', 'js', 'svg', 'markdown', 'json', 'python', 'lua'];
