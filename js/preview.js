/* preview.js — تشغيل الأكواد المولّدة داخل إطار معزول (sandbox iframe) */

import { esc } from './util.js';

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
  #__err{position:fixed;inset-inline:0;bottom:0;background:#b00020;color:#fff;padding:8px 12px;font:13px/1.5 monospace;display:none;white-space:pre-wrap}
</style>`;

/* تحويل الكود إلى مستند HTML كامل قابل للتشغيل */
export function buildDoc({ lang = 'html', code = '' } = {}) {
  const l = (lang || '').toLowerCase();
  const body = String(code || '');

  if (l === 'css') {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}${BRIDGE}
<style>${body}</style></head>
<body><h1>معاينة CSS</h1><p>هذا نموذج لتجربة التنسيقات:</p>
<button>زر</button> <a href="#">رابط</a> <input placeholder="حقل إدخال" />
<div class="box" style="margin-top:12px;padding:12px;border:1px solid #888;border-radius:10px">صندوق تجريبي</div>
<ul><li>عنصر أول</li><li>عنصر ثاني</li></ul>
<div id="__err"></div></body></html>`;
  }

  if (l === 'js' || l === 'javascript' || l === 'mjs') {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}${BRIDGE}
<style>body{background:#0f1424;color:#eaefff}#out{margin-top:12px}</style></head>
<body><div id="app"></div><pre id="out"></pre><div id="__err"></div>
<script>${body}<\/script></body></html>`;
  }

  if (l === 'svg') {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}${BRIDGE}</head>
<body style="display:grid;place-items:center;min-height:100vh">${body}<div id="__err"></div></body></html>`;
  }

  // HTML (أو أي شيء آخر)
  if (/<html[\s>]/i.test(body)) {
    return injectIntoHtml(body);
  }
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${BASE_CSS}${BRIDGE}</head>
<body>${body}<div id="__err"></div></body></html>`;
}

/* إضافة الجسر لمستند HTML كامل يرسله النموذج */
function injectIntoHtml(html) {
  let out = html;
  if (!/<meta[^>]+charset/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`);
  }
  if (!/<head[^>]*>/i.test(out)) out = out.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8"></head>`);
  if (!/id="__err"/.test(out)) out = out.replace(/<\/body>/i, '<div id="__err"></div></body>');
  return out.replace(/<\/head>/i, `${BRIDGE}</head>`);
}

/* إنشاء مشغّل: يربط الإطار ويستقبل السجلات */
export function attachRunner(iframe, { onLog } = {}) {
  const handler = (e) => {
    const d = e.data;
    if (!d || d.source !== 'mosaaidi-preview') return;
    // نتجاهل رسائل الإطارات الأخرى (يوجد أكثر من معاينة في الصفحة)
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
  const ext = { css: 'html', js: 'html', javascript: 'html', mjs: 'html', svg: 'svg' }[(artifact.lang || '').toLowerCase()] || 'html';
  return `${base}.${ext}`;
}

export { esc };
