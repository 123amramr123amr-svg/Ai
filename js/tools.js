/* tools.js — أدوات الوكلاء: تنفيذ أكواد، بحث ويب، جلب صفحات، توليد صور، معاينة، ذاكرة */

import { Settings, Assets, Artifacts } from './db.js';
import { chat, generateImage, PROVIDERS, getConnection } from './providers.js';
import { attachmentDataUrl } from './media.js';
import { truncateForPrompt, bytes } from './util.js';

/* ============================ تنفيذ JavaScript في بيئة معزولة ============================ */
const WORKER_SRC = `
self.onmessage = async (e) => {
  const logs = [];
  const fmt = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 1); } catch { return String(v); } };
  const console = {
    log: (...a) => logs.push(a.map(fmt).join(' ')),
    info: (...a) => logs.push(a.map(fmt).join(' ')),
    warn: (...a) => logs.push('WARN ' + a.map(fmt).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(fmt).join(' ')),
  };
  let result = null, error = null;
  try {
    const fn = new Function('console', '"use strict";\\n' + e.data.code);
    result = await fn(console);
  } catch (err) { error = (err && err.message) || String(err); }
  self.postMessage({ logs, result: result === undefined ? null : fmt(result), error });
};
`;

export function runJsSandbox(code, { timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    let url, worker, done = false;
    const finish = (out) => {
      if (done) return;
      done = true;
      try { worker?.terminate(); } catch {}
      try { URL.revokeObjectURL(url); } catch {}
      resolve(out);
    };
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch (e) { return resolve({ logs: [], result: null, error: 'تعذّر تشغيل البيئة المعزولة: ' + e.message }); }
    const timer = setTimeout(() => finish({ logs: [], result: null, error: `انتهى الوقت (${timeout / 1000} ثانية) — ربما توجد حلقة لا نهائية.` }), timeout);
    worker.onmessage = (e) => { clearTimeout(timer); finish(e.data); };
    worker.onerror = (e) => { clearTimeout(timer); finish({ logs: [], result: null, error: e.message || 'خطأ داخل الكود' }); };
    worker.postMessage({ code: String(code) });
  });
}

/* ============================ أدوات مساعدة ============================ */
function calc(expr) {
  const s = String(expr || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
  if (!/^[-+*/(). %0-9eE*]+$/.test(s)) throw new Error('تعبير غير مسموح — أرقام وعمليات حسابية فقط');
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict";return (${s});`)();
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('نتيجة غير صالحة');
  return v;
}

async function proxyUrl() { return (await Settings.get('fetchProxy', 'https://r.jina.ai/')) || ''; }
async function searchKeys() { return (await Settings.get('searchKeys', {})) || {}; }

/* ============================ تعريفات الأدوات (JSON Schema) ============================ */
export const TOOL_DEFS = [
  {
    name: 'run_javascript',
    label: 'تنفيذ كود JavaScript',
    description: 'ينفّذ كود JavaScript في بيئة معزولة ويعيد ما طبعه console.log والنتيجة النهائية. استخدمه للحسابات ومعالجة البيانات وتجربة الأكواد.',
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'كود JavaScript المطلوب تنفيذه' } }, required: ['code'] },
  },
  {
    name: 'calculator',
    label: 'آلة حاسبة',
    description: 'يحسب تعبيرًا حسابيًا بدقة (+, -, *, /, %, **).',
    parameters: { type: 'object', properties: { expression: { type: 'string', description: 'مثال: (25*4)+18/3' } }, required: ['expression'] },
  },
  {
    name: 'web_search',
    label: 'بحث في الويب',
    description: 'يبحث في الإنترنت ويعيد أهم النتائج والعناوين والروابط. يحتاج مفتاح بحث في الإعدادات (Tavily أو Brave).',
    parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', description: 'عدد النتائج (1-10)' } }, required: ['query'] },
  },
  {
    name: 'fetch_url',
    label: 'جلب محتوى صفحة',
    description: 'يجلب نص صفحة ويب أو ملف نصي من رابط ويعيده كنص.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'generate_image',
    label: 'توليد صورة',
    description: 'ينشئ صورة من وصف نصي ويعرضها للمستخدم داخل المحادثة. يحتاج مزوّدًا يدعم توليد الصور (OpenAI/xAI/Gemini).',
    parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'وصف الصورة بالتفصيل' } }, required: ['prompt'] },
  },
  {
    name: 'create_preview',
    label: 'إنشاء كود للمعاينة',
    description: 'يحفظ كودًا (HTML/CSS/JS) في صفحة المعاينة ليشغّله المستخدم فورًا. استخدمه دائمًا عند كتابة واجهة أو لعبة أو تطبيق ويب.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'اسم المشروع' },
        language: { type: 'string', description: 'html أو js أو css أو svg', enum: ['html', 'js', 'css', 'svg'] },
        code: { type: 'string', description: 'الكود الكامل' },
      },
      required: ['title', 'code'],
    },
  },
  {
    name: 'write_file',
    label: 'إنشاء ملف',
    description: 'ينشئ ملفًا نصيًا (كود، ملاحظات، CSV…) ويحفظه على جهاز المستخدم لتحميله.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
  },
  {
    name: 'read_file',
    label: 'قراءة مرفق',
    description: 'يقرأ محتوى ملف أرسله المستخدم في هذه المحادثة.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'اسم الملف أو جزء منه' } }, required: ['name'] },
  },
  {
    name: 'remember',

    label: 'تذكّر معلومة',
    description: 'يحفظ معلومة دائمة عن المستخدم (اسمه، تفضيلاته، مشروعه) لاستخدامها في كل المحادثات.',
    parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
  },
  {
    name: 'recall',
    label: 'استرجاع الذاكرة',
    description: 'يعيد كل المعلومات المحفوظة عن المستخدم.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'current_datetime',
    label: 'التاريخ والوقت',
    description: 'يعيد تاريخ ووقت الجهاز الحالي.',
    parameters: { type: 'object', properties: {} },
  },
];

export const toolByName = (n) => TOOL_DEFS.find((t) => t.name === n) || null;



/* ============================ تنفيذ أداة ============================ */
export async function executeTool(name, args = {}, ctx = {}) {
  const step = (summary) => ctx.onStep?.({ name, args, summary });
  try {
    switch (name) {
      case 'run_javascript': {
        const out = await runJsSandbox(args.code || '');
        const parts = [];
        if (out.logs?.length) parts.push('المخرجات:\n' + out.logs.join('\n'));
        if (out.result !== null && out.result !== undefined) parts.push('القيمة النهائية: ' + out.result);
        if (out.error) parts.push('خطأ: ' + out.error);
        const text = parts.join('\n') || '(نُفِّذ بدون مخرجات)';
        step(text.slice(0, 220));
        return text;
      }

      case 'calculator': {
        const v = calc(args.expression);
        step(`${args.expression} = ${v}`);
        return String(v);
      }

      case 'current_datetime': {
        const now = new Date();
        const t = now.toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
        step(t);
        return `${t} (ISO: ${now.toISOString()})`;
      }

      case 'remember': {
        const list = (await Settings.get('memory', [])) || [];
        const fact = String(args.fact || '').trim();
        if (fact && !list.includes(fact)) list.push(fact);
        await Settings.set('memory', list.slice(-200));
        step('حُفظت المعلومة');
        return 'تم الحفظ.';
      }

      case 'recall': {
        const list = (await Settings.get('memory', [])) || [];
        step(`${list.length} معلومة محفوظة`);
        return list.length ? list.map((f, i) => `${i + 1}. ${f}`).join('\n') : 'لا توجد معلومات محفوظة بعد.';
      }

      case 'read_file': {
        const files = ctx.attachments || [];
        const q = String(args.name || '').toLowerCase();
        const found = files.filter((f) => (f.name || '').toLowerCase().includes(q));
        if (!found.length) return `لم أجد ملفًا بالاسم "${args.name}". الملفات المتاحة: ${files.map((f) => f.name).join(', ') || 'لا يوجد'}`;
        const chunks = [];
        for (const f of found) {
          if (f.text) chunks.push(`### ${f.name}\n${truncateForPrompt(f.text, 20000)}`);
          else chunks.push(`### ${f.name} (${f.mime}, ${bytes(f.size)}) — ملف غير نصي، لا يمكن قراءة محتواه.`);
        }
        step(`قُرئ ${found.length} ملف`);
        return chunks.join('\n\n');
      }

      case 'write_file': {
        const name = args.name || 'file.txt';
        const blob = new Blob([String(args.content ?? '')], { type: 'text/plain;charset=utf-8' });
        const rec = await Assets.put(blob, { name, type: 'text/plain', kind: 'file' });
        ctx.onFile?.({ id: rec.id, name, size: blob.size, mime: 'text/plain', kind: 'file' });
        step(`أُنشئ الملف ${name} (${bytes(blob.size)})`);
        return `تم إنشاء الملف "${name}" (${bytes(blob.size)}) وهو متاح للمستخدم للتحميل.`;
      }

      case 'create_preview': {
        const lang = (args.language || 'html').toLowerCase();
        const art = await Artifacts.add({
          title: args.title || 'مشروع بدون اسم',
          lang, code: String(args.code || ''), kind: 'web',
          conversationId: ctx.conversationId || '',
        });
        ctx.onArtifact?.(art);
        step(`أُنشئ مشروع «${art.title}» (${lang})`);
        return `تم حفظ الكود في صفحة المعاينة باسم "${art.title}". المستخدم يمكنه تشغيله الآن من تبويب 🧪 المعاينة.`;
      }

      case 'generate_image': {
        const providerId = ctx.imageProvider || ctx.providerId;
        const img = await generateImage({ providerId, prompt: args.prompt, model: ctx.imageModel || '' });
        const blob = await (await fetch(img.dataUrl)).blob().catch(() => null);
        if (blob) {
          const rec = await Assets.put(blob, { name: `image-${Date.now()}.png`, type: blob.type || 'image/png', kind: 'image' });
          ctx.onImage?.({ id: rec.id, dataUrl: img.dataUrl, name: rec.name, prompt: args.prompt, mime: blob.type || 'image/png', size: blob.size });
        } else {
          ctx.onImage?.({ dataUrl: img.dataUrl, name: 'image.png', prompt: args.prompt, mime: img.mime });
        }
        step(`وُلِّدت صورة: ${String(args.prompt).slice(0, 80)}`);
        return 'تم توليد الصورة وعرضها للمستخدم داخل المحادثة.';
      }

      case 'fetch_url': {
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return 'رابط غير صالح — يجب أن يبدأ بـ http:// أو https://';
        const proxy = await proxyUrl();
        const target = proxy ? proxy.replace(/\/+$/, '') + '/' + url : url;
        const r = await fetch(target, { headers: proxy ? { 'X-Return-Format': 'text' } : {} });
        if (!r.ok) { step(`فشل الجلب ${r.status}`); return `تعذّر جلب الصفحة (${r.status}).`; }
        const text = truncateForPrompt(await r.text(), 30000);
        step(`جُلب ${text.length} حرفًا`);
        return text || '(الصفحة فارغة)';
      }

      case 'web_search': {
        const keys = await searchKeys();
        const q = String(args.query || '');
        const max = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);
        if (keys.tavily) {
          const r = await fetch('https://api.tavily.com/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: keys.tavily, query: q, max_results: max, include_answer: true }),
          });
          if (!r.ok) return `فشل البحث (${r.status}).`;
          const j = await r.json();
          const lines = [];
          if (j.answer) lines.push(`خلاصة: ${j.answer}`);
          for (const res of j.results || []) lines.push(`- ${res.title}\n  ${res.url}\n  ${truncateForPrompt(res.content || '', 700)}`);
          step(`${(j.results || []).length} نتيجة`);
          return lines.join('\n') || 'لا نتائج.';
        }
        if (keys.brave) {
          const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${max}`, {
            headers: { 'X-Subscription-Token': keys.brave, Accept: 'application/json' },
          });
          if (!r.ok) return `فشل البحث (${r.status}).`;
          const j = await r.json();
          const lines = (j.web?.results || []).map((x) => `- ${x.title}\n  ${x.url}\n  ${truncateForPrompt(x.description || '', 500)}`);
          step(`${lines.length} نتيجة`);
          return lines.join('\n') || 'لا نتائج.';
        }
        const proxy = await proxyUrl();
        if (!proxy) return 'البحث يحتاج مفتاح Tavily أو Brave من الإعدادات ← الأدوات، أو ضبط رابط بروكسي للجلب.';
        const r = await fetch(proxy.replace(/\/+$/, '') + '/https://duckduckgo.com/html/?q=' + encodeURIComponent(q));
        if (!r.ok) return `فشل البحث (${r.status}).`;
        const text = truncateForPrompt(await r.text(), 8000);
        step('بحث احتياطي');
        return text;
      }


      default:
        return `أداة غير معروفة: ${name}`;
    }
  } catch (e) {
    const msg = 'خطأ في الأداة ' + name + ': ' + (e.message || String(e));
    step(msg);
    return msg;
  }
}

/* ============================ حلقة الوكيل (Agent Loop) ============================ */
/**
 * يشغّل الوكيل: يرسل الرسائل، وإذا طلب النموذج أدوات ينفّذها ويعيد النتيجة له،
 * ثم يكرّر حتى يصل لردّ نهائي أو ينتهي عدد الخطوات.
 */
export async function runAgentLoop({
  providerId, model, system, history, tools, temperature, maxTokens, signal,
  onDelta, onToolStep, onRoundStart, ctx = {}, maxSteps = 6,
}) {
  const convo = [...(history || [])];
  const steps = [];
  let lastText = '';
  let usage = null;

  for (let round = 0; round < maxSteps; round++) {
    if (signal?.aborted) break;
    onRoundStart?.(round);
    const res = await chat({
      providerId, model,
      messages: convo,
      system, tools,
      temperature, maxTokens, signal,
      onDelta,
    });
    lastText = res.text || '';
    usage = res.usage || usage;

    if (!res.toolCalls?.length) return { text: lastText, steps, usage, rounds: round + 1 };

    convo.push({
      role: 'assistant',
      content: res.text ? [{ type: 'text', text: res.text }] : [],
      tool_calls: res.toolCalls,
    });

    for (const tc of res.toolCalls) {
      if (signal?.aborted) break;
      const args = tc.arguments || {};
      onToolStep?.({ phase: 'start', name: tc.name, args });
      const out = await executeTool(tc.name, args, { ...ctx, onStep: onToolStep });
      steps.push({ name: tc.name, args, result: out });
      onToolStep?.({ phase: 'end', name: tc.name, args, result: out });
      convo.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: String(out) });
    }
  }

  return { text: lastText, steps, usage, rounds: maxSteps, truncated: true };
}

/* قائمة أسماء الأدوات المتاحة */
export const TOOL_LIST = TOOL_DEFS.map((t) => t.name);
