/* preview.js — تشغيل الأكواد في إطار معزول (sandbox) مع دعم عدة لغات برمجة */

import { esc } from './util.js';
import { runtimeOf } from './runtimes.js';
import { renderMarkdown } from './markdown.js';

/* جسر الـ console: يرسل كل شيء للأب عبر postMessage */
const BRIDGE = `<script>
(function(){
  var send = function(level, args){
    try {
      parent.postMessage({ source:'mosaaidi-preview', type:level, text: Array.prototype.map.call(args, function(a){
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch(e) { return String(a); }
      }).join(' ') }, '*');
    } catch(e){}
  };
  window.__send = send;
  ['log','info','warn','error','debug'].forEach(function(k){
    var orig = console[k] ? console[k].bind(console) : function(){};
    console[k] = function(){ send(k === 'debug' ? 'log' : k, arguments); orig.apply(null, arguments); };
  });
  window.addEventListener('error', function(e){ send('error', [e.message + (e.lineno ? ' (سطر ' + e.lineno + ')' : '')]); });
  window.addEventListener('unhandledrejection', function(e){ send('error', ['وعد مرفوض: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)]); });
  document.addEventListener('DOMContentLoaded', function(){ send('ready', ['الصفحة جاهزة']); });
  parent.postMessage({ source:'mosaaidi-preview', type:'boot', text:'تم تشغيل المعاينة' }, '*');
})();
<\/script>`;

const BASE_CSS = `<style>
  :root{color-scheme:light dark}
  body{margin:0;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
  .__console{background:#0f1424;color:#eaefff;border-radius:10px;padding:12px;font:13px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;direction:ltr;text-align:left;margin-top:12px}
  .__note{background:#fff6e0;color:#5a4200;border:1px solid #ffd479;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}
  .__note.err{background:#ffe9ec;color:#7a0d1c;border-color:#ff9aa8}
</style>`;

const HTML_HEAD = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}${BRIDGE}`;

/* تشفير آمن لكود داخل وسم <script> */
const asJsString = (code) => JSON.stringify(String(code)).replace(/<\//g, '<\\/');

/* ============================ مولّدات كل لغة ============================ */

function docWeb(lang, code) {
  const l = (lang || '').toLowerCase();
  if (l === 'css') {
    return `${HTML_HEAD}<style>${code}</style></head>
<body><h1>معاينة CSS</h1><p>هذا نموذج لتجربة التنسيقات:</p>
<button>زر</button> <a href="#">رابط</a> <input placeholder="حقل إدخال" />
<div class="box" style="margin-top:12px;padding:12px;border:1px solid #888;border-radius:10px">صندوق تجريبي</div>
<ul><li>عنصر أول</li><li>عنصر ثاني</li></ul></body></html>`;
  }
  if (l === 'js' || l === 'javascript' || l === 'mjs') {
    return `${HTML_HEAD}<style>body{background:#0f1424;color:#eaefff}</style></head>
<body><div id="app"></div><pre id="out" style="white-space:pre-wrap"></pre>
<script>${String(code).replace(/<\//g, '<\\/')}<\/script></body></html>`;
  }
  if (l === 'jsx') {
    return `${HTML_HEAD}<style>body{background:#0f1424;color:#eaefff}</style></head>
<body><div id="app"></div>
<div class="__note">ملاحظة: JSX يحتاج تحويلًا. سيُجرَّب تشغيله كما هو، وإذا احتاج React أضِفه من رابط CDN داخل كودك.</div>
<script>${String(code).replace(/<\//g, '<\\/')}<\/script></body></html>`;
  }
  if (l === 'svg') {
    return `${HTML_HEAD}</head><body style="display:grid;place-items:center;min-height:100vh">${code}</body></html>`;
  }
  if (l === 'xml') {
    return `${HTML_HEAD}</head><body><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${esc(code)}</pre></body></html>`;
  }
  if (l === 'json') {
    let pretty = code;
    try { pretty = JSON.stringify(JSON.parse(code), null, 2); } catch (e) { pretty = code + '\n\n// تعذّر تحليل JSON: ' + e.message; }
    return `${HTML_HEAD}<style>body{background:#0f1424;color:#eaefff}</style></head>
<body><div class="__note">عرض JSON (للقراءة فقط)</div><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${esc(pretty)}</pre></body></html>`;
  }
  if (l === 'markdown' || l === 'md') {
    const html = renderMarkdown(code);
    return `${HTML_HEAD}</head><body><div class="__note">عرض Markdown كما سيظهر بعد التحويل</div>${html}</body></html>`;
  }
  // HTML (أو كود غير محدد يحتوي وسوم)
  if (/<html[\s>]/i.test(code)) return injectIntoHtml(code);
  return `${HTML_HEAD}</head><body>${code}</body></html>`;
}

function docPython(code) {
  return `${HTML_HEAD}<style>body{background:#0f1424;color:#eaefff}</style></head>
<body>
<div id="__status" class="__note">🐍 جارٍ تحميل مفسّر بايثون… (أول مرة فقط، ثم يُخزَّن)</div>
<div id="__console" class="__console"></div>
<script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js" onerror="__loadErr('بايثون')"><\/script>
<script>
(function(){
  var status = document.getElementById('__status');
  var box = document.getElementById('__console');
  function line(s){ box.textContent += s + '\\n'; box.scrollTop = box.scrollHeight; }
  window.__loadErr = function(what){
    status.className = '__note err';
    status.textContent = '❌ تعذّر تحميل مفسّر ' + what + ' — تأكد من اتصال الإنترنت (يُحمَّل أول مرة فقط).';
  };
  (async function(){
    try {
      if (typeof loadPyodide !== 'function') { window.__loadErr('بايثون'); return; }
      var py = await loadPyodide();
      status.className = '__note';
      status.textContent = '✅ مفسّر بايثون ' + py.version + ' جاهز';
      py.setStdout({ batched: function(s){ line(s); } });
      py.setStderr({ batched: function(s){ line('⚠️ ' + s); } });
      var res = await py.runPythonAsync(${asJsString(code)});
      if (res !== undefined && res !== null) line('⇒ ' + res);
      window.__send('done', ['انتهى التنفيذ']);
    } catch (e) {
      line('❌ ' + (e && e.message ? e.message : e));
      status.className = '__note err';
      status.textContent = 'حدث خطأ أثناء تنفيذ كود بايثون — التفاصيل بالأسفل.';
    }
  })();
})();
<\/script></body></html>`;
}

function docLua(code) {
  return `${HTML_HEAD}<style>body{background:#0f1424;color:#eaefff}</style></head>
<body>
<div id="__status" class="__note">🌙 جارٍ تحميل مفسّر لوا… (أول مرة فقط)</div>
<div id="__console" class="__console"></div>
<script src="https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js" onerror="__loadErr('لوا')"><\/script>
<script>
(function(){
  var status = document.getElementById('__status');
  var box = document.getElementById('__console');
  function line(s){ box.textContent += s + '\\n'; box.scrollTop = box.scrollHeight; }
  window.__loadErr = function(what){
    status.className = '__note err';
    status.textContent = '❌ تعذّر تحميل مفسّر ' + what + ' — تأكد من اتصال الإنترنت.';
  };
  function run(){
    try {
      var f = window.fengari;
      if (!f) { window.__loadErr('لوا'); return; }
      var L = f.lauxlib.luaL_newstate();
      f.lualib.luaL_openlibs(L);
      var oldPrint = f.lua.lua_tojsstring;
      var st = f.lauxlib.luaL_dostring(L, f.to_luastring(${asJsString(code)}));
      if (st !== f.lua.LUA_OK) {
        line('❌ ' + f.lua.lua_tojsstring(L, -1));
      }
      status.textContent = '✅ تم تنفيذ كود لوا';
      window.__send('done', ['انتهى التنفيذ']);
    } catch (e) {
      line('❌ ' + (e && e.message ? e.message : e));
      status.className = '__note err';
      status.textContent = 'حدث خطأ أثناء تنفيذ كود لوا.';
    }
  }
  window.addEventListener('load', function(){ setTimeout(run, 60); });
  setTimeout(function(){ if (document.getElementById('__console').textContent === '') run(); }, 2500);
})();
<\/script></body></html>`;
}

/* ============================ الواجهة ============================ */

/* تحويل الكود إلى مستند HTML كامل قابل للتشغيل */
export function buildDoc({ lang = 'html', code = '' } = {}) {
  const rt = runtimeOf(lang, code);
  if (!rt) {
    return `${HTML_HEAD}</head><body><div class="__note err">هذه اللغة (${esc(lang || 'غير محددة')}) لا يمكن تشغيلها داخل التطبيق — يمكنك نسخ الكود أو تنزيله.</div><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${esc(code)}</pre></body></html>`;
  }
  if (rt.kind === 'pyodide') return docPython(code);
  if (rt.kind === 'fengari') return docLua(code);
  return docWeb((lang || 'html').toLowerCase(), code);
}

/* إضافة الجسر لمستند HTML كامل يرسله النموذج */
function injectIntoHtml(html) {
  let out = String(html);
  if (!/<meta[^>]+charset/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`);
  }
  if (!/<head[^>]*>/i.test(out)) out = out.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8"></head>`);
  return out.replace(/<\/head>/i, `${BRIDGE}</head>`);
}

/* إنشاء مشغّل: يربط الإطار ويستقبل السجلات */
export function attachRunner(iframe, { onLog } = {}) {
  const handler = (e) => {
    const d = e.data;
    if (!d || d.source !== 'mosaaidi-preview') return;
    try { if (iframe.contentWindow && e.source && e.source !== iframe.contentWindow) return; } catch {}
    onLog?.({ type: d.type === 'boot' ? 'info' : d.type, text: d.text, at: Date.now() });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/* تشغيل كود في الإطار */
export function runInFrame(iframe, artifact) {
  iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads');
  iframe.srcdoc = buildDoc(artifact);
}

export function stopFrame(iframe) {
  try { iframe.srcdoc = '<!DOCTYPE html><html><body style="font-family:system-ui;padding:20px;color:#888">تم إيقاف المعاينة.</body></html>'; } catch {}
}

/* ملف HTML قابل للتحميل */
export function artifactToHtmlFile(artifact) {
  return buildDoc(artifact);
}

/* اسم ملف مناسب */
export function artifactFileName(artifact) {
  const base = (artifact.title || 'preview').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
  const ext = { css: 'html', js: 'html', javascript: 'html', mjs: 'html', svg: 'svg', markdown: 'html', md: 'html', json: 'json', python: 'py', py: 'py', lua: 'lua' }[(artifact.lang || '').toLowerCase()] || 'html';
  return `${base}.${ext}`;
}

export { esc };
