/* tests/smoke.test.js — تشغيل التطبيق فعليًا في بيئة DOM وهمية (jsdom) مع IndexedDB وهمي
 * يتحقق من: بدء التشغيل، إضافة مفتاح، محادثة جديدة، البث المباشر، حلقة الوكلاء، الحفظ في السجل.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

let dom, app;

function sseResponse(chunks) {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

before(async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
  const w = dom.window;

  const def = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { globalThis[k] = v; } };
  def('window', w);
  def('document', w.document);
  def('navigator', w.navigator);
  def('location', w.location);
  def('HTMLElement', w.HTMLElement);
  def('Event', w.Event);
  def('CustomEvent', w.CustomEvent);
  def('localStorage', w.localStorage);
  def('getComputedStyle', w.getComputedStyle.bind(w));
  def('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  w.indexedDB = globalThis.indexedDB;
  w.IDBKeyRange = globalThis.IDBKeyRange;

  app = await import('../js/app.js');
  await new Promise((r) => setTimeout(r, 250));
});

test('smoke: التطبيق يبدأ ويعرض الواجهة', () => {
  assert.ok(document.querySelector('#convList'), 'قائمة المحادثات موجودة');
  assert.ok(document.querySelector('.nav-item'), 'عناصر التنقل موجودة');
  assert.equal(document.querySelector('#view-chats').hidden, false, 'صفحة البداية ظاهرة');
});

test('smoke: حفظ المفاتيح في التخزين المحلي', async () => {
  const { setKey, getKey, getConnection } = await import('../js/providers.js');
  await setKey('openai', 'sk-test-123');
  assert.equal(await getKey('openai'), 'sk-test-123');
  const conn = await getConnection('openai');
  assert.equal(conn.baseUrl, 'https://api.openai.com/v1');
  assert.equal(conn.apiKey, 'sk-test-123');
});

test('smoke: إنشاء محادثة ثم بث رد من المزوّد', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
    return sseResponse([
      { choices: [{ delta: { content: 'أهلاً' } }] },
      { choices: [{ delta: { content: ' بك!' }, finish_reason: 'stop' }], usage: { total_tokens: 12 } },
    ]);
  };

  const conv = await app.newChat({ title: 'اختبار' });
  assert.ok(conv.id);

  document.querySelector('#input').value = 'مرحبًا، من أنت؟';
  await app.sendMessage();
  await new Promise((r) => setTimeout(r, 120));

  assert.equal(calls.length, 1, 'طلب واحد للمزوّد');
  assert.match(calls[0].url, /chat\/completions$/);
  assert.equal(calls[0].body.model, 'gpt-4o-mini');
  assert.equal(calls[0].body.messages[0].role, 'system');

  const msgs = await (await import('../js/db.js')).Messages.byConversation(conv.id);
  assert.equal(msgs.length, 2, 'رسالة المستخدم + رد المساعد');
  const reply = msgs.find((m) => m.role === 'assistant');
  assert.match(reply.content[0].text, /أهلاً بك!/);
  assert.equal(reply.meta.usage.total_tokens, 12);
});

test('smoke: حلقة الوكيل تستدعي أداة الآلة الحاسبة ثم تُجيب', async () => {
  let step = 0;
  globalThis.fetch = async () => {
    step++;
    if (step === 1) {
      return sseResponse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'calculator', arguments: '{"expression":"2*21"}' } }] }, finish_reason: 'tool_calls' }] },
      ]);
    }
    return sseResponse([{ choices: [{ delta: { content: 'الناتج 42' }, finish_reason: 'stop' }] }]);
  };

  const { Agents } = await import('../js/db.js');
  const agent = await Agents.add({ name: 'وكيل اختبار', system: 'اختبر', tools: ['calculator'] });
  app.state.agents = await Agents.list();

  const conv = await app.newChat({ agentId: agent.id, title: 'وكيل' });
  document.querySelector('#input').value = 'احسب 2*21';
  await app.sendMessage();
  await new Promise((r) => setTimeout(r, 200));

  const msgs = await (await import('../js/db.js')).Messages.byConversation(conv.id);
  const reply = msgs.find((m) => m.role === 'assistant');
  assert.match(reply.content[0].text, /42/);
  assert.ok(reply.meta.toolSteps.length >= 1, 'تم تنفيذ أداة واحدة على الأقل');
  assert.equal(reply.meta.toolSteps[0].name, 'calculator');
});

test('smoke: صفحة المعاينة تُنشئ كودًا وتعرضه', async () => {
  const { Artifacts } = await import('../js/db.js');
  await Artifacts.add({ title: 'اختبار معاينة', lang: 'html', code: '<h1>مرحبا</h1>', kind: 'web' });
  app.state.artifacts = await Artifacts.list();
  app.goto('preview');
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(document.querySelector('#pvFrame'), 'إطار المعاينة موجود');
  assert.ok(document.querySelector('#pvCode').value.includes('مرحبا'), 'الكود محمّل في المحرر');
  document.querySelector('#runArt').click();
  await new Promise((r) => setTimeout(r, 40));
  const frame = document.querySelector('#pvFrame');
  assert.match(frame.getAttribute('sandbox') || '', /allow-scripts/);
});

test('smoke: صفحة الإعدادات تعرض كل المزوّدين', async () => {
  app.goto('settings');
  await new Promise((r) => setTimeout(r, 100));
  const rows = document.querySelectorAll('#keyRows .key-row');
  assert.ok(rows.length >= 8, 'صفوف المفاتيح معروضة: ' + rows.length);
  assert.ok(document.querySelector('[data-key="openai"]'));
});

test('smoke: خطأ المفتاح يُعرض كرسالة واضحة', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 });
  const { chat } = await import('../js/providers.js');
  await assert.rejects(
    () => chat({ providerId: 'openai', model: 'gpt-4o-mini', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }),
    (e) => /401/.test(e.message) && /المفتاح/.test(e.message)
  );
});

test('smoke: الأدوات مُفعَّلة تلقائيًا في المحادثة العادية', async () => {
  let body = null;
  globalThis.fetch = async (_u, opts) => {
    body = JSON.parse(opts.body);
    return sseResponse([{ choices: [{ delta: { content: 'تمام' }, finish_reason: 'stop' }] }]);
  };
  await app.newChat({ title: 'أدوات' });
  document.querySelector('#input').value = 'شغّل كود يطبع 1+1';
  await app.sendMessage();
  await new Promise((r) => setTimeout(r, 120));

  assert.ok(Array.isArray(body.tools), 'الأدوات أُرسلت للنموذج');
  const names = body.tools.map((t) => t.function.name);
  assert.ok(names.includes('run_javascript'), 'أداة تنفيذ الكود متاحة: ' + names.join(','));
  assert.ok(names.includes('create_preview'), 'أداة المعاينة متاحة');
  assert.equal(body.tool_choice, 'auto');
});

test('smoke: المعاينة الحيّة تعمل تلقائيًا داخل رد الذكاء الاصطناعي', async () => {
  globalThis.fetch = async () => sseResponse([
    { choices: [{ delta: { content: 'اتفضل ده كود:\n\n```html\n<h1 id="x">أهلاً</h1>\n<script>console.log(1)<\/script>\n```\n' }, finish_reason: 'stop' }] },
  ]);
  await app.newChat({ title: 'كود تلقائي' });
  document.querySelector('#input').value = 'اعمل لي صفحة';
  await app.sendMessage();
  await new Promise((r) => setTimeout(r, 200));

  const live = document.querySelector('#messages [data-live]');
  assert.ok(live, 'كتلة المعاينة الحيّة ظهرت تحت الكود');
  const iframe = live.querySelector('iframe');
  assert.ok(iframe, 'الإطار أُنشئ تلقائيًا بدون أي ضغط من المستخدم');
  assert.match(iframe.getAttribute('sandbox') || '', /allow-scripts/);
  assert.match(iframe.getAttribute('srcdoc') || '', /<h1 id="x">/);

  const { Artifacts } = await import('../js/db.js');
  const arts = await Artifacts.list();
  const fromReply = arts.filter((a) => a.auto);
  assert.ok(fromReply.length >= 1, 'الكود حُفظ تلقائيًا في مكتبة المعاينة');
  assert.ok(fromReply[0].conversationId, 'مرتبط بالمحادثة');
  assert.ok(fromReply[0].hash, 'له بصمة لمنع التكرار');
});

test('smoke: إضافة نموذج خاص (مفتاح + رابط + موديل) والتحقق منه', async () => {
  const P = await import('../js/providers.js');
  const rec = await P.addCustomProvider({
    label: 'سيرفري المحلي', emoji: '🏠', kind: 'openai',
    baseUrl: 'http://192.168.1.9:1234/v1/', apiKey: 'sk-mine', models: ['my-model-1'],
  });
  assert.equal(rec.baseUrl, 'http://192.168.1.9:1234/v1', 'تم تنظيف الرابط');
  assert.ok(P.allProviders().some((p) => p.id === rec.id), 'ظاهر في كل المزوّدين');
  assert.equal(P.getProvider(rec.id).label, 'سيرفري المحلي');

  const conn = await P.getConnection(rec.id);
  assert.equal(conn.apiKey, 'sk-mine');
  assert.equal(conn.baseUrl, 'http://192.168.1.9:1234/v1');

  const avail = await P.availableProviders();
  assert.ok(avail.some((p) => p.id === rec.id), 'متاح للاستخدام في المحادثة');

  // تحقق: يجلب الموديلات ثم يجرّب ردًّا
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'my-model-1' }, { id: 'my-model-2' }] }), { status: 200 });
    return sseResponse([{ choices: [{ delta: { content: 'تمام' }, finish_reason: 'stop' }] }]);
  };
  const r = await P.verifyProviderConfig(rec);
  assert.equal(r.models.length, 2);
  assert.equal(r.reply, 'تمام');
  assert.equal(r.model, 'my-model-1');
  assert.ok(calls.some((u) => u.includes('/chat/completions')), 'جرّب ردًّا فعليًا');

  await P.removeCustomProvider(rec.id);
  assert.ok(!P.allProviders().some((p) => p.id === rec.id), 'تم الحذف');
});
