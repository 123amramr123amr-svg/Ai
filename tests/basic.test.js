/* tests/basic.test.js — اختبارات للدوال الأساسية (تُشغَّل بـ npm test) */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esc, bytes, clampText, dataURLToParts, isTextLike, fileIcon, b64ToBlob } from '../js/util.js';
import { renderMarkdown, extractArtifacts, isRunnable, langLabel } from '../js/markdown.js';
import { toOAIMessages, toAnthropicMessages, toGeminiContents, toOAITools, toAnthropicTools, toGeminiTools, PROVIDERS, getProvider } from '../js/providers.js';
import { executeTool, TOOL_DEFS } from '../js/tools.js';

const CAPS = { vision: true, audioIn: true, video: true, files: true, tools: true };

test('util: الهروب من HTML', () => {
  assert.equal(esc('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
});

test('util: تنسيق الأحجام والقص', () => {
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(2048), '2.0 KB');
  assert.equal(bytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(clampText('مرحبا بالعالم', 5), 'مرحب…');
});

test('util: تفكيك data URL', () => {
  const p = dataURLToParts('data:image/png;base64,AAAA');
  assert.equal(p.mime, 'image/png');
  assert.equal(p.base64, 'AAAA');
});

test('util: تمييز الملفات النصية والأيقونات', () => {
  assert.ok(isTextLike('text/plain', 'a.txt'));
  assert.ok(isTextLike('', 'script.py'));
  assert.ok(!isTextLike('video/mp4', 'v.mp4'));
  assert.equal(fileIcon('image/jpeg'), '🖼️');
  assert.equal(fileIcon('video/mp4'), '🎬');
  assert.equal(fileIcon('application/pdf'), '📕');
});

test('util: تحويل base64 إلى Blob', () => {
  const blob = b64ToBlob(btoa('hello'), 'text/plain');
  assert.equal(blob.type, 'text/plain');
  assert.equal(blob.size, 5);
});

test('markdown: العناوين والقوائم والكود', () => {
  const html = renderMarkdown('# عنوان\n\n- أول\n- ثاني\n\n```js\nconsole.log(1)\n```');
  assert.match(html, /<h1>عنوان<\/h1>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>أول<\/li>/);
  assert.match(html, /lang-js/);
  assert.match(html, /console\.log\(1\)/);
});

test('markdown: حماية من حقن HTML', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('markdown: استخراج الأكواد القابلة للتشغيل', () => {
  const md = ['```html', '<h1>hi</h1>', '```', '', '```python', 'print(1)', '```', '', '```cobol', 'DISPLAY "x"', '```'].join('\n');
  const arts = extractArtifacts(md);
  assert.equal(arts.length, 2, 'HTML و Python قابلان للتشغيل');
  assert.equal(arts[0].lang, 'html');
  assert.equal(arts[0].kind, 'web');
  assert.equal(arts[1].lang, 'python');
  assert.ok(isRunnable('js', ''));
  assert.ok(isRunnable('lua', ''));
  assert.ok(isRunnable('markdown', ''));
  assert.ok(!isRunnable('cobol', 'DISPLAY "x"'), 'اللغات غير المدعومة تُستبعد');
  assert.equal(langLabel('js'), 'JavaScript');
  assert.equal(langLabel('python'), 'Python');
});

test('providers: تحويل رسالة وسائط إلى صيغة OpenAI', () => {
  const msgs = toOAIMessages([
    { role: 'user', content: [{ type: 'text', text: 'ما هذا؟' }, { type: 'image', dataUrl: 'data:image/png;base64,AAA' }] },
  ], CAPS, 'أنت مساعد');
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.equal(msgs[1].content[0].type, 'text');
  assert.equal(msgs[1].content[1].type, 'image_url');
  assert.equal(msgs[1].content[1].image_url.url, 'data:image/png;base64,AAA');
});

test('providers: الصور تُحوَّل لنص عند عدم دعم الرؤية', () => {
  const msgs = toOAIMessages([{ role: 'user', content: [{ type: 'image', dataUrl: 'data:image/png;base64,AAA', name: 'p.png' }] }], { vision: false }, '');
  assert.equal(msgs[0].content[0].type, 'text');
  assert.match(msgs[0].content[0].text, /لا يدعم الصور/);
});

test('providers: تحويل Anthropic للصور وPDF', () => {
  const msgs = toAnthropicMessages([
    { role: 'user', content: [{ type: 'text', text: 'اقرأ' }, { type: 'file', dataUrl: 'data:application/pdf;base64,QQ==', mime: 'application/pdf', name: 'a.pdf' }] },
  ], CAPS, 'sys');
  assert.equal(msgs[0].role, 'user');
  assert.equal(msgs[0].content[1].type, 'document');
  assert.equal(msgs[0].content[1].source.media_type, 'application/pdf');
});

test('providers: دمج رسائل Anthropic المتتالية بنفس الدور', () => {
  const msgs = toAnthropicMessages([
    { role: 'user', content: [{ type: 'text', text: 'أ' }] },
    { role: 'user', content: [{ type: 'text', text: 'ب' }] },
  ], CAPS, '');
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content.length, 2);
});

test('providers: تحويل Gemini يدعم الفيديو والصوت', () => {
  const msgs = toGeminiContents([
    { role: 'user', content: [{ type: 'video', dataUrl: 'data:video/mp4;base64,QQ==', mime: 'video/mp4' }] },
  ], CAPS);
  assert.equal(msgs[0].role, 'user');
  assert.ok(msgs[0].parts[0].inlineData);
  assert.equal(msgs[0].parts[0].inlineData.mimeType, 'video/mp4');
});

test('providers: مخططات الأدوات لكل مزوّد', () => {
  const tools = [{ name: 'f', description: 'd', parameters: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } }];
  assert.equal(toOAITools(tools)[0].function.name, 'f');
  assert.equal(toAnthropicTools(tools)[0].input_schema.type, 'object');
  const g = toGeminiTools(tools);
  assert.equal(g[0].functionDeclarations[0].name, 'f');
  assert.ok(!('additionalProperties' in g[0].functionDeclarations[0].parameters));
});

test('providers: السجل يحتوي المزوّدين الأساسيين', () => {
  const ids = PROVIDERS.map((p) => p.id);
  for (const id of ['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'deepseek', 'ollama', 'custom']) {
    assert.ok(ids.includes(id), 'مفقود: ' + id);
  }
  assert.equal(getProvider('gemini').kind, 'gemini');
  assert.ok(getProvider('ollama').noKey);
});

test('tools: تعريفات الأدوات سليمة', () => {
  const names = TOOL_DEFS.map((t) => t.name);
  assert.ok(names.includes('run_javascript'));
  assert.ok(names.includes('create_preview'));
  assert.ok(names.includes('generate_image'));
  for (const t of TOOL_DEFS) assert.ok(t.name && t.description && t.parameters, 'أداة ناقصة: ' + t.name);
});

test('tools: الآلة الحاسبة تعمل', async () => {
  assert.equal(await executeTool('calculator', { expression: '(25*4)+18/3' }), '106');
});

test('tools: الآلة الحاسبة ترفض الكود الخبيث', async () => {
  const r = await executeTool('calculator', { expression: 'process.exit(1)' });
  assert.match(r, /غير مسموح|خطأ/);
});

test('tools: التاريخ والوقت', async () => {
  assert.match(await executeTool('current_datetime', {}), /ISO:/);
});

test('tools: أداة غير معروفة', async () => {
  assert.match(await executeTool('لا_توجد', {}), /غير معروفة/);
});

test('usage: حساب التكلفة والرموز', async () => {
  const u = await import('../js/usage.js');
  assert.equal(u.priceOf('gpt-4o-mini').known, true);
  assert.equal(u.priceOf('gpt-4o-mini').in, 0.15);
  assert.equal(u.priceOf('some-unknown-model').known, false);
  assert.ok(Math.abs(u.costOf('gpt-4o', 1e6, 1e6) - 12.5) < 1e-9, 'gpt-4o: 2.5 + 10');
  assert.ok(Math.abs(u.costOf('gpt-4o-mini', 1e6, 0) - 0.15) < 1e-9);
  assert.equal(u.money(0), '$0');
  assert.match(u.money(0.0021), /^\$0\.00/);
  assert.equal(u.tokensFmt(1500), '1.5K');
  assert.equal(u.tokensFmt(2500000), '2.50M');
});

test('usage: توحيد شكل الإحصاءات من كل مزوّد', async () => {
  const u = await import('../js/usage.js');
  assert.deepEqual(u.normalizeUsage({ prompt_tokens: 10, completion_tokens: 20 }), { tokensIn: 10, tokensOut: 20 });
  assert.deepEqual(u.normalizeUsage({ input_tokens: 5, output_tokens: 7 }), { tokensIn: 5, tokensOut: 7 });
  assert.deepEqual(u.normalizeUsage({ promptTokenCount: 3, candidatesTokenCount: 4 }), { tokensIn: 3, tokensOut: 4 });
  assert.deepEqual(u.normalizeUsage(null), { tokensIn: 0, tokensOut: 0 });
});

test('usage: التجميع والرسم البياني', async () => {
  const u = await import('../js/usage.js');
  const now = Date.now();
  const rows = [
    { ts: now, model: 'gpt-4o-mini', providerId: 'openai', tokensIn: 1000, tokensOut: 500, cost: 0.00045 },
    { ts: now, model: 'gpt-4o-mini', providerId: 'openai', tokensIn: 2000, tokensOut: 1000, cost: 0.0009 },
    { ts: now, model: 'claude-sonnet-4', providerId: 'anthropic', tokensIn: 500, tokensOut: 200, cost: 0.0045 },
  ];
  const s = u.summarize(rows);
  assert.equal(s.requests, 3);
  assert.equal(s.totalTokens, 5200);
  assert.equal(s.tokensIn, 3500);
  assert.equal(s.tokensOut, 1700);
  assert.equal(s.byModel.size, 2);
  assert.equal(s.byModel.get('gpt-4o-mini').requests, 2);
  assert.equal(s.byProvider.get('openai').requests, 2);
  assert.ok(Math.abs(s.cost - 0.00585) < 1e-9);
  const days = u.lastDays(s.byDay, 7);
  assert.equal(days.length, 7);
  assert.equal(days[6].tokens, 5200, 'اليوم الأخير = اليوم');
});
