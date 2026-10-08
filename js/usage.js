/* usage.js — تتبّع الاستخدام والتكلفة التقريبية لكل نموذج */

import { Usage } from './db.js';

/* أسعار تقريبية بالدولار لكل مليون رمز [إدخال، إخراج] — عدّلها من الإعدادات إن تغيّرت */
export const PRICES = [
  [/gpt-4o-mini/i, 0.15, 0.6],
  [/gpt-4\.1-mini/i, 0.4, 1.6],
  [/gpt-4\.1-nano/i, 0.1, 0.4],
  [/gpt-4\.1/i, 2, 8],
  [/gpt-4o/i, 2.5, 10],
  [/o4-mini/i, 1.1, 4.4],
  [/o3-mini/i, 1.1, 4.4],
  [/claude-3-5-haiku/i, 0.8, 4],
  [/claude-3-opus/i, 15, 75],
  [/claude.*haiku/i, 0.8, 4],
  [/claude/i, 3, 15],
  [/gemini-2\.5-flash-lite/i, 0.1, 0.4],
  [/gemini-2\.5-flash/i, 0.3, 2.5],
  [/gemini-2\.0-flash/i, 0.1, 0.4],
  [/gemini-2\.5-pro/i, 1.25, 10],
  [/gemini/i, 0.5, 3],
  [/deepseek-reasoner/i, 0.55, 2.19],
  [/deepseek/i, 0.27, 1.1],
  [/llama-3\.3-70b/i, 0.59, 0.79],
  [/llama-3\.1-8b/i, 0.05, 0.08],
  [/llama-4-scout/i, 0.11, 0.34],
  [/mistral-large/i, 2, 6],
  [/mistral-small/i, 0.2, 0.6],
  [/grok-4/i, 3, 15],
  [/grok-3-mini/i, 0.3, 0.5],
  [/grok/i, 3, 15],
  [/qwen/i, 0.2, 0.6],
];

export function priceOf(model) {
  const m = String(model || '');
  for (const [re, i, o] of PRICES) if (re.test(m)) return { in: i, out: o, known: true };
  return { in: 1, out: 3, known: false }; // تقدير عام للنماذج المجهولة
}

export function costOf(model, tokensIn, tokensOut) {
  const p = priceOf(model);
  return ((tokensIn || 0) / 1e6) * p.in + ((tokensOut || 0) / 1e6) * p.out;
}

/* توحيد شكل الاستخدام القادم من كل مزوّد */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return { tokensIn: 0, tokensOut: 0 };
  const tokensIn = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? usage.inputTokens ?? 0;
  const tokensOut = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? usage.outputTokens ?? 0;
  return { tokensIn: Number(tokensIn) || 0, tokensOut: Number(tokensOut) || 0 };
}

/* تسجيل طلب */
export async function record({ providerId, model, usage, conversationId, ms, ok = true, kind = 'chat' }) {
  const { tokensIn, tokensOut } = normalizeUsage(usage);
  if (!tokensIn && !tokensOut && ok) return null; // بعض المزوّدين لا يرسلون إحصاءات
  const cost = costOf(model, tokensIn, tokensOut);
  return Usage.add({ providerId, model, tokensIn, tokensOut, cost, conversationId: conversationId || '', ms: ms || 0, ok, kind });
}

/* تجميع للإحصائيات */
export function summarize(rows) {
  const out = {
    requests: rows.length, totalTokens: 0, tokensIn: 0, tokensOut: 0, cost: 0,
    byModel: new Map(), byDay: new Map(), byProvider: new Map(),
  };
  for (const r of rows) {
    out.totalTokens += (r.tokensIn || 0) + (r.tokensOut || 0);
    out.tokensIn += r.tokensIn || 0;
    out.tokensOut += r.tokensOut || 0;
    out.cost += r.cost || 0;
    const mk = r.model || 'غير معروف';
    const m = out.byModel.get(mk) || { model: mk, providerId: r.providerId, requests: 0, tokens: 0, cost: 0 };
    m.requests++; m.tokens += (r.tokensIn || 0) + (r.tokensOut || 0); m.cost += r.cost || 0;
    out.byModel.set(mk, m);
    const d = new Date(r.ts).toISOString().slice(0, 10);
    const day = out.byDay.get(d) || { day: d, tokens: 0, cost: 0, requests: 0 };
    day.tokens += (r.tokensIn || 0) + (r.tokensOut || 0); day.cost += r.cost || 0; day.requests++;
    out.byDay.set(d, day);
    const pk = r.providerId || 'غير معروف';
    const p = out.byProvider.get(pk) || { providerId: pk, requests: 0, cost: 0 };
    p.requests++; p.cost += r.cost || 0;
    out.byProvider.set(pk, p);
  }
  return out;
}

export const money = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return '$0';
  if (v < 0.01) return '$' + v.toFixed(4);
  if (v < 1) return '$' + v.toFixed(3);
  return '$' + v.toFixed(2);
};

export const tokensFmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(v);
};

/* آخر N يوم كمصفوفة جاهزة للرسم */
export function lastDays(byDay, n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const rec = byDay.get(key) || { tokens: 0, cost: 0, requests: 0 };
    out.push({ day: key, label: d.toLocaleDateString('ar-EG', { weekday: 'short' }), ...rec });
  }
  return out;
}
