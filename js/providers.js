/* providers.js — سجل مزوّدي الذكاء الاصطناعي + محوّلات الرسائل + البث المباشر
 *
 * المصطلحات:
 *  - provider: مزوّد (OpenAI, Anthropic, Gemini, OpenRouter …)
 *  - kind: نوع الواجهة البرمجية ('openai' | 'anthropic' | 'gemini')
 *  - الرسائل داخليًا: { role, content: Part[], tool_calls?, tool_call_id?, name? }
 *    Part = { type:'text', text }
 *         | { type:'image'|'video'|'audio'|'file', dataUrl, mime, name, text? }
 */

import { Settings } from './db.js';
import { dataURLToParts, truncateForPrompt, isTextLike } from './util.js';

/* ============================ السجل ============================ */
export const PROVIDERS = [
  {
    id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys', emoji: '🟢',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    caps: { vision: true, audioIn: true, video: false, files: true, tools: true, imageGen: true, stt: true },
    note: 'يدعم الصور والصوت والدوال (tools) وتوليد الصور.',
  },
  {
    id: 'anthropic', label: 'Anthropic Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys', emoji: '🟣',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'يدعم الصور وملفات PDF والدوال.',
  },
  {
    id: 'gemini', label: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/app/apikey', emoji: '🔵',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'],
    caps: { vision: true, audioIn: true, video: true, files: true, tools: true, imageGen: true, stt: false },
    note: 'الأقوى في فهم الصوت والفيديو والصور.',
  },
  {
    id: 'openrouter', label: 'OpenRouter (كل النماذج)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys', emoji: '🔀',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'مفتاح واحد لكل النماذج تقريبًا.',
  },
  {
    id: 'groq', label: 'Groq (سريع جدًا)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys', emoji: '⚡',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'whisper-large-v3-turbo'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: true },
    note: 'مجاني/رخيص وسريع، ويدعم تحويل الصوت لنص (Whisper).',
  },
  {
    id: 'deepseek', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys', emoji: '🐋',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    caps: { vision: false, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'رخيص جدًا للنصوص والأكواد.',
  },
  {
    id: 'mistral', label: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys', emoji: '🌬️',
    models: ['mistral-large-latest', 'mistral-small-latest', 'pixtral-large-latest'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'يدعم الصور (Pixtral) والدوال.',
  },
  {
    id: 'xai', label: 'xAI Grok', kind: 'openai', baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai', emoji: '✖️',
    models: ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-vision-latest'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: true, stt: false },
    note: 'يدعم الصور والدوال وتوليد الصور.',
  },
  {
    id: 'together', label: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.xyz/settings/api-keys', emoji: '🤝',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-VL-72B-Instruct'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: true, stt: false },
    note: 'نماذج مفتوحة المصدر كثيرة.',
  },
  {
    id: 'ollama', label: 'Ollama (محلي على جهازك)', kind: 'openai', baseUrl: 'http://localhost:11434/v1',
    keyUrl: 'https://ollama.com/download', emoji: '🏠', noKey: true,
    models: ['llama3.2', 'qwen2.5', 'llava', 'mistral'],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'بدون مفتاح — يعمل إذا كان Ollama شغّالًا على نفس الجهاز.',
  },
  {
    id: 'custom', label: 'مزوّد مخصص (OpenAI-compatible)', kind: 'openai', baseUrl: '',
    keyUrl: '', emoji: '🧩', models: [],
    caps: { vision: true, audioIn: false, video: false, files: true, tools: true, imageGen: false, stt: false },
    note: 'أي سيرفر متوافق مع واجهة OpenAI (LM Studio, vLLM, OpenWebUI…).',
  },
];

export const getProvider = (id) => PROVIDERS.find((p) => p.id === id) || null;

/* ============================ المفاتيح ============================ */
export async function getKeys() { return (await Settings.get('apiKeys', {})) || {}; }

export async function setKey(providerId, key) {
  const k = await getKeys();
  if (key) k[providerId] = key; else delete k[providerId];
  await Settings.set('apiKeys', k);
  return k;
}

export async function getKey(providerId) { return (await getKeys())[providerId] || ''; }

export async function getConnection(providerId) {
  const p = getProvider(providerId);
  if (!p) return null;
  const keys = await getKeys();
  const baseUrls = (await Settings.get('baseUrls', {})) || {};
  return {
    ...p,
    apiKey: keys[providerId] || '',
    baseUrl: (baseUrls[providerId] || p.baseUrl || '').replace(/\/+$/, ''),
  };
}

export async function setBaseUrl(providerId, url) {
  const b = (await Settings.get('baseUrls', {})) || {};
  if (url) b[providerId] = url.replace(/\/+$/, ''); else delete b[providerId];
  await Settings.set('baseUrls', b);
  return b;
}

/* ============================ أدوات داخلية ============================ */
function noteFor(part, why) {
  const label = { image: 'صورة', video: 'فيديو', audio: 'مقطع صوتي', file: 'ملف' }[part.type] || 'مرفق';
  return `[مرفق ${label}: ${part.name || 'بدون اسم'}${part.mime ? ` (${part.mime})` : ''}${part.size ? ` – ${Math.round(part.size / 1024)}KB` : ''}]` + (why ? ` — ${why}` : '');
}

function fileToText(part) {
  return `[محتوى الملف: ${part.name || 'ملف'}]\n\`\`\`\n${truncateForPrompt(part.text || '', 20000)}\n\`\`\``;
}

/* جزء ملف → نص مناسب للإرسال (لأي مزوّد لا يدعم الملفات مباشرة) */
function fileToTextPart(part) {
  if (part.text && isTextLike(part.mime, part.name)) return { type: 'text', text: fileToText(part) };
  return { type: 'text', text: noteFor(part, 'لا يمكن قراءة محتواه كنص') };
}

/* ============================ تحويلات: OpenAI ============================ */
function partsToPlainText(content) {
  if (typeof content === 'string') return content;
  return (content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
}

function oaiContent(content, caps = {}) {
  const out = [];
  for (const p of content || []) {
    switch (p.type) {
      case 'text':
        if (p.text) out.push({ type: 'text', text: p.text });
        break;
      case 'image':
        if (caps.vision) out.push({ type: 'image_url', image_url: { url: p.dataUrl, detail: 'auto' } });
        else out.push({ type: 'text', text: noteFor(p) + ' (النموذج المختار لا يدعم الصور)' });
        break;
      case 'audio': {
        const { mime, base64 } = dataURLToParts(p.dataUrl || '');
        const fmt = /wav/.test(mime) ? 'wav' : /mp3|mpeg/.test(mime) ? 'mp3' : null;
        if (caps.audioIn && fmt) out.push({ type: 'input_audio', input_audio: { data: base64, format: fmt } });
        else out.push({ type: 'text', text: p.text || noteFor(p, 'تعذّر إرسال الصوت لهذا النموذج') });
        break;
      }
      case 'video':
        out.push({ type: 'text', text: noteFor(p, caps.video ? '' : 'الفيديو غير مدعوم في هذه الواجهة، جرّب Gemini') });
        break;
      default:
        out.push(fileToTextPart(p));
    }
  }
  if (!out.length) out.push({ type: 'text', text: '(رسالة فارغة)' });
  return out;
}

function toOAIMessages(messages, caps, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages || []) {
    if (m.role === 'system') { out.push({ role: 'system', content: partsToPlainText(m.content) }); continue; }
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : partsToPlainText(m.content) });
      continue;
    }
    if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: partsToPlainText(m.content) || null };
      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}) },
        }));
      }
      out.push(msg);
      continue;
    }
    out.push({ role: 'user', content: oaiContent(m.content, caps) });
  }
  return out;
}

function toOAITools(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
  }));
}

/* ============================ تحويلات: Anthropic ============================ */
function anthropicContent(content, caps = {}) {
  const out = [];
  for (const p of content || []) {
    if (p.type === 'text') { if (p.text) out.push({ type: 'text', text: p.text }); continue; }
    if (p.type === 'image' && caps.vision) {
      const { mime, base64 } = dataURLToParts(p.dataUrl || '');
      out.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
      continue;
    }
    if (p.type === 'file' && /pdf/.test(p.mime || '')) {
      const { mime, base64 } = dataURLToParts(p.dataUrl || '');
      out.push({ type: 'document', source: { type: 'base64', media_type: mime || 'application/pdf', data: base64 } });
      continue;
    }
    if (p.type === 'text' || p.type === 'file') { out.push(fileToTextPart(p)); continue; }
    if (p.type === 'image') { out.push({ type: 'text', text: noteFor(p) + ' (النموذج لا يدعم الصور)' }); continue; }
    out.push({ type: 'text', text: p.text || noteFor(p, 'غير مدعوم في Anthropic — جرّب Gemini') });
  }
  if (!out.length) out.push({ type: 'text', text: '(رسالة فارغة)' });
  return out;
}

function toAnthropicMessages(messages, caps, system) {
  const out = [];
  for (const m of messages || []) {
    if (m.role === 'system') continue; // يُرسل في حقل system
    if (m.role === 'tool') {
      out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : partsToPlainText(m.content) }] });
      continue;
    }
    if (m.role === 'assistant') {
      const blocks = anthropicContent(m.content, caps);
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: typeof tc.arguments === 'string' ? (safeParse(tc.arguments) || { raw: tc.arguments }) : (tc.arguments || {}) });
        }
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    out.push({ role: 'user', content: anthropicContent(m.content, caps) });
  }
  return ensureAlternating(out, system);
}

/* Anthropic يرفض رسائل من نفس الدور متتالية → ندمجها */
function ensureAlternating(msgs, system) {
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = [...(Array.isArray(last.content) ? last.content : []), ...(Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }])];
    else merged.push({ role: m.role, content: m.content });
  }
  if (!merged.length) merged.push({ role: 'user', content: [{ type: 'text', text: '(فارغ)' }] });
  if (merged[0].role !== 'user') merged.unshift({ role: 'user', content: [{ type: 'text', text: system ? 'التزم بتعليمات النظام.' : 'مرحبًا' }] });
  return merged;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function toAnthropicTools(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters || { type: 'object', properties: {} } }));
}

/* ============================ شبكة: SSE ============================ */
async function httpError(res) {
  let body = '';
  try { body = await res.text(); } catch {}
  let msg = body;
  try { const j = JSON.parse(body); msg = j.error?.message || j.message || j.error || body; } catch {}
  if (typeof msg === 'object') msg = JSON.stringify(msg);
  const hints = {
    401: 'المفتاح غير صحيح أو منتهي. تأكد من نسخه كاملًا في صفحة الإعدادات.',
    403: 'لا صلاحية لهذا المفتاح أو هذا الموديل.',
    404: 'الموديل أو الرابط غير صحيح. تحقق من اسم الموديل أو عنوان الـ base URL.',
    429: 'تجاوزت الحد المسموح (Rate limit) أو رصيدك انتهى. انتظر قليلًا أو استخدم مفتاحًا آخر.',
  };
  const hint = hints[res.status] ? ` — ${hints[res.status]}` : '';
  return new Error(`خطأ ${res.status}${hint}${msg ? `\n${String(msg).slice(0, 500)}` : ''}`);
}

async function* sseEvents(res, signal) {
  if (!res.body) throw new Error('لا يوجد بث من السيرفر');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let lastEvent = null;
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.startsWith('event:')) { lastEvent = line.slice(6).trim(); continue; }
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { yield { event: 'done', data: null }; continue; }
        if (!data) continue;
        let obj = null;
        try { obj = JSON.parse(data); } catch {}
        yield { event: lastEvent || 'message', data: obj, raw: data };
        lastEvent = null;
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

/* ============================ محوّل: OpenAI-compatible ============================ */
async function streamOpenAI({ conn, model, messages, system, tools, temperature, maxTokens, signal, onDelta, onToolDelta }) {
  const body = {
    model,
    messages: toOAIMessages(messages, conn.caps, system),
    stream: true,
    temperature: typeof temperature === 'number' ? temperature : undefined,
    max_tokens: maxTokens || undefined,
  };
  const t = toOAITools(tools);
  if (t) { body.tools = t; body.tool_choice = 'auto'; }
  if (conn.id === 'openai') body.stream_options = { include_usage: true };
  if (conn.id === 'custom') delete body.stream_options;

  const headers = { 'Content-Type': 'application/json' };
  if (conn.apiKey) headers.Authorization = `Bearer ${conn.apiKey}`;
  if (conn.id === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Mosaaidi App'; }

  const res = await fetch(`${conn.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw await httpError(res);

  let text = '';
  const toolAcc = new Map();
  let finishReason = null;
  let usage = null;

  for await (const ev of sseEvents(res, signal)) {
    if (ev.event === 'done' || !ev.data) continue;
    const d = ev.data;
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    if (d.usage) usage = d.usage;
    const ch = d.choices?.[0];
    if (!ch) continue;
    if (ch.finish_reason) finishReason = ch.finish_reason;
    const delta = ch.delta || ch.message || {};
    if (delta.content) {
      const piece = typeof delta.content === 'string' ? delta.content : (delta.content.map?.((c) => c.text).join('') || '');
      if (piece) { text += piece; onDelta?.(piece, text); }
    }
    if (delta.reasoning_content) onDelta?.('', text, { reasoning: delta.reasoning_content });
    for (const tc of delta.tool_calls || []) {
      const idx = tc.index ?? 0;
      const cur = toolAcc.get(idx) || { id: '', name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      toolAcc.set(idx, cur);
      onToolDelta?.(cur);
    }
  }

  const toolCalls = [...toolAcc.values()].filter((c) => c.name).map((c) => ({
    id: c.id || 'call_' + Math.random().toString(36).slice(2, 8),
    name: c.name,
    arguments: safeParse(c.args) || {},
    rawArguments: c.args,
  }));
  return { text, toolCalls, finishReason, usage };
}

/* ============================ محوّل: Anthropic ============================ */
async function streamAnthropic({ conn, model, messages, system, tools, temperature, maxTokens, signal, onDelta }) {
  const body = {
    model,
    max_tokens: maxTokens || 4096,
    messages: toAnthropicMessages(messages, conn.caps, system),
    stream: true,
    temperature: typeof temperature === 'number' ? temperature : undefined,
  };
  if (system) body.system = system;
  const t = toAnthropicTools(tools);
  if (t) { body.tools = t; }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': conn.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const res = await fetch(`${conn.baseUrl}/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw await httpError(res);

  let text = '';
  const blocks = new Map(); // index -> tool_use
  let usage = null;
  let finishReason = null;

  for await (const ev of sseEvents(res, signal)) {
    const d = ev.data;
    if (!d) continue;
    if (ev.event === 'error' || d.type === 'error') throw new Error(d.error?.message || JSON.stringify(d.error || d));
    switch (d.type) {
      case 'message_start':
        usage = { ...(usage || {}), ...(d.message?.usage || {}) };
        break;
      case 'content_block_start':
        if (d.content_block?.type === 'tool_use') blocks.set(d.index, { id: d.content_block.id, name: d.content_block.name, args: '' });
        break;
      case 'content_block_delta':
        if (d.delta?.type === 'text_delta') { text += d.delta.text; onDelta?.(d.delta.text, text); }
        else if (d.delta?.type === 'thinking_delta') onDelta?.('', text, { reasoning: d.delta.thinking });
        else if (d.delta?.type === 'input_json_delta') { const b = blocks.get(d.index); if (b) b.args += d.delta.partial_json || ''; }
        break;
      case 'message_delta':
        if (d.usage) usage = { ...(usage || {}), ...d.usage };
        if (d.delta?.stop_reason) finishReason = d.delta.stop_reason;
        break;
      default: break;
    }
  }

  const toolCalls = [...blocks.values()].map((b) => ({ id: b.id, name: b.name, arguments: safeParse(b.args) || {}, rawArguments: b.args }));
  return { text, toolCalls, finishReason, usage };
}

/* ============================ محوّل: Google Gemini ============================ */
async function streamGemini({ conn, model, messages, system, tools, temperature, maxTokens, signal, onDelta }) {
  const body = {
    contents: toGeminiContents(messages, conn.caps),
    generationConfig: { temperature: typeof temperature === 'number' ? temperature : undefined, maxOutputTokens: maxTokens || undefined },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const t = toGeminiTools(tools);
  if (t) { body.tools = t; }

  const url = `${conn.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(conn.apiKey)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) throw await httpError(res);

  let text = '';
  const toolCalls = [];
  let usage = null;
  let finishReason = null;

  for await (const ev of sseEvents(res, signal)) {
    const d = ev.data;
    if (!d) continue;
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    if (d.usageMetadata) usage = d.usageMetadata;
    const cand = d.candidates?.[0];
    if (!cand) continue;
    if (cand.finishReason) finishReason = cand.finishReason;
    for (const part of cand.content?.parts || []) {
      if (part.text) { text += part.text; onDelta?.(part.text, text); }
      if (part.functionCall) {
        toolCalls.push({ id: 'call_' + Math.random().toString(36).slice(2, 8), name: part.functionCall.name, arguments: part.functionCall.args || {} });
      }
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        onDelta?.('', text, { inline: { dataUrl: `data:${mime};base64,${part.inlineData.data}`, mime } });
      }
    }
  }
  return { text, toolCalls, finishReason, usage };
}

/* ============================ الواجهة العامة ============================ */
export async function chat({ providerId, model, messages, system, tools, temperature, maxTokens, signal, onDelta, onToolDelta }) {
  const conn = await getConnection(providerId);
  if (!conn) throw new Error('مزوّد غير معروف: ' + providerId);
  if (!conn.apiKey && !conn.noKey) throw new Error(`لا يوجد مفتاح API لـ ${conn.label}. أضِفه من صفحة الإعدادات.`);
  if (!conn.baseUrl) throw new Error('رابط الخدمة (Base URL) غير محدد لهذا المزوّد.');
  if (!model) throw new Error('لم تختر موديلًا بعد.');

  const args = { conn, model, messages, system, tools, temperature, maxTokens, signal, onDelta, onToolDelta };
  if (conn.kind === 'anthropic') return streamAnthropic(args);
  if (conn.kind === 'gemini') return streamGemini(args);
  return streamOpenAI(args);
}

/* قائمة الموديلات من المزوّد نفسه (مع الرجوع للقائمة المقترحة عند الفشل) */
export async function listModels(providerId) {
  const conn = await getConnection(providerId);
  if (!conn) throw new Error('مزوّد غير معروف');
  const fallback = { models: conn.models, fromApi: false };
  if (!conn.baseUrl) return fallback;
  try {
    if (conn.kind === 'gemini') {
      const r = await fetch(`${conn.baseUrl}/models?key=${encodeURIComponent(conn.apiKey)}`);
      if (!r.ok) return fallback;
      const j = await r.json();
      const models = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
      return models.length ? { models, fromApi: true } : fallback;
    }
    if (conn.kind === 'anthropic') {
      const r = await fetch(`${conn.baseUrl}/models?limit=100`, { headers: { 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
      if (!r.ok) return fallback;
      const j = await r.json();
      const models = (j.data || []).map((m) => m.id);
      return models.length ? { models, fromApi: true } : fallback;
    }
    const headers = {};
    if (conn.apiKey) headers.Authorization = `Bearer ${conn.apiKey}`;
    const r = await fetch(`${conn.baseUrl}/models`, { headers });
    if (!r.ok) return fallback;
    const j = await r.json();
    const ids = (j.data || j.models || []).map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
    if (!ids.length) return fallback;
    ids.sort();
    return { models: ids, fromApi: true };
  } catch { return fallback; }
}

export async function testConnection(providerId, model) {
  try {
    const out = await chat({
      providerId,
      model: model || (getProvider(providerId)?.models?.[0]),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'اكتب كلمة: تمام' }] }],
      maxTokens: 16, temperature: 0,
    });
    return { ok: true, text: (out.text || '').trim() || '(رد فارغ)' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/* ============================ توليد الصور ============================ */
export async function generateImage({ providerId, model, prompt, size = '1024x1024' }) {
  const conn = await getConnection(providerId);
  if (!conn) throw new Error('مزوّد غير معروف');
  if (!conn.apiKey) throw new Error(`لا يوجد مفتاح API لـ ${conn.label}.`);

  if (conn.kind === 'gemini') {
    const m = model || 'imagen-3.0-generate-002';
    const r = await fetch(`${conn.baseUrl}/models/${encodeURIComponent(m)}:predict?key=${encodeURIComponent(conn.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
    });
    if (!r.ok) throw await httpError(r);
    const j = await r.json();
    const pred = j.predictions?.[0] || {};
    const b64 = pred.bytesBase64Encoded || pred.image?.imageBytes;
    if (!b64) throw new Error('لم يرسل المزوّد صورة. تأكد أن الموديل يدعم توليد الصور.');
    const mime = pred.mimeType || 'image/png';
    return { dataUrl: `data:${mime};base64,${b64}`, mime, model: m };
  }

  const m = model || (conn.id === 'xai' ? 'grok-2-image' : 'gpt-image-1');
  const body = { model: m, prompt, n: 1 };
  if (m.startsWith('dall-e')) { body.size = size; body.response_format = 'b64_json'; }
  const r = await fetch(`${conn.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await httpError(r);
  const j = await r.json();
  const item = j.data?.[0] || {};
  let dataUrl = '';
  if (item.b64_json) dataUrl = `data:image/png;base64,${item.b64_json}`;
  else if (item.url) dataUrl = item.url;
  if (!dataUrl) throw new Error('لم يرسل المزوّد صورة.');
  return { dataUrl, mime: 'image/png', model: m, revisedPrompt: item.revised_prompt || '' };
}

/* ============================ تحويل الصوت إلى نص ============================ */
export async function transcribe({ providerId, blob, filename = 'voice.webm', model, language }) {
  const conn = await getConnection(providerId);
  if (!conn) throw new Error('مزوّد غير معروف');
  if (!conn.apiKey) throw new Error(`لا يوجد مفتاح API لـ ${conn.label}.`);
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('model', model || (conn.id === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1'));
  if (language) fd.append('language', language);
  const r = await fetch(`${conn.baseUrl}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${conn.apiKey}` }, body: fd,
  });
  if (!r.ok) throw await httpError(r);
  const j = await r.json();
  return { text: j.text || '' };
}

/* المزوّدون المتاحون حاليًا (لديهم مفتاح أو لا يحتاجون مفتاحًا) */
export async function availableProviders() {
  const keys = await getKeys();
  const baseUrls = (await Settings.get('baseUrls', {})) || {};
  return PROVIDERS.filter((p) => p.noKey || keys[p.id] || baseUrls[p.id]);
}




function geminiParts(content, caps = {}) {
  const parts = [];
  for (const p of content || []) {
    if (p.type === 'text') { if (p.text) parts.push({ text: p.text }); continue; }
    if (p.type === 'image' || p.type === 'video' || p.type === 'audio') {
      const supported = p.type === 'image' ? caps.vision : p.type === 'audio' ? caps.audioIn !== false : true;
      const { mime, base64 } = dataURLToParts(p.dataUrl || '');
      if (supported && p.dataUrl) parts.push({ inlineData: { mimeType: p.mime || mime, data: base64 } });
      else parts.push({ text: p.text || noteFor(p, 'غير مدعوم في هذه الواجهة') });
      continue;
    }
    if (p.text && isTextLike(p.mime, p.name)) { parts.push({ text: fileToText(p) }); continue; }
    if (p.dataUrl) { const { mime, base64 } = dataURLToParts(p.dataUrl); parts.push({ inlineData: { mimeType: p.mime || mime, data: base64 } }); }
    else parts.push({ text: noteFor(p) });
  }
  if (!parts.length) parts.push({ text: '(فارغ)' });
  return parts;
}

function toGeminiContents(messages, caps) {
  const contents = [];
  for (const m of messages || []) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name || 'tool', response: { result: typeof m.content === 'string' ? m.content : partsToPlainText(m.content) } } }] });
      continue;
    }
    if (m.role === 'assistant') {
      const parts = geminiParts(m.content, caps);
      for (const tc of m.tool_calls || []) {
        parts.push({ functionCall: { name: tc.name, args: typeof tc.arguments === 'string' ? (safeParse(tc.arguments) || {}) : (tc.arguments || {}) } });
      }
      contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: 'user', parts: geminiParts(m.content, caps) });
  }
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: '(فارغ)' }] });
  return contents;
}

function toGeminiTools(tools) {
  if (!tools?.length) return undefined;
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: stripSchema(t.parameters) })) }];
}

/* Gemini لا يقبل بعض كلمات JSON Schema مثل additionalProperties */
function stripSchema(s) {
  if (!s || typeof s !== 'object') return { type: 'object', properties: {} };
  const out = { type: s.type || 'object' };
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = stripSchema(v);
  }
  if (s.items) out.items = stripSchema(s.items);
  if (s.enum) out.enum = s.enum;
  if (s.required) out.required = s.required;
  return out;
}




/* مُصدَّرة للاختبارات والاستخدام الخارجي */
export {
  partsToPlainText, toOAIMessages, toAnthropicMessages, toGeminiContents,
  toOAITools, toAnthropicTools, toGeminiTools, noteFor, fileToTextPart,
};
