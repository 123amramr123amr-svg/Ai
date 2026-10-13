/* اختبار شامل من الطرفين: سيرفر مزوّد وهمي (بالبث) + التطبيق في متصفح حقيقي */
'use strict';
const http = require('http');
const puppeteer = require('/workspace/.tools/pptr/node_modules/puppeteer');

const APP = 'http://localhost:8099';
const MOCK_PORT = 8123;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let lastBody = null;
let streamingSeen = false;

/* ------------------------- سيرفر مزوّد وهمي ------------------------- */
function chunk(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    if (req.url.indexOf('/models') >= 0) {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      return res.end(JSON.stringify({ data: [
        { id: 'mock-smart', name: 'Mock Smart' },
        { id: 'mock-free:free', name: 'Mock Free', pricing: { prompt: '0', completion: '0' } }
      ] }));
    }

    if (req.url.indexOf('/chat/completions') >= 0) {
      lastBody = JSON.parse(raw || '{}');
      const wantsStream = lastBody.stream === true;
      const hasToolResult = (lastBody.messages || []).some(m => m.role === 'tool');

      if (!wantsStream) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
        return res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: hasToolResult ? 'النتيجة النهائية 4.' : 'رد بدون بث.' } }]
        }));
      }

      res.writeHead(200, Object.assign({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }, cors));

      if (!hasToolResult) {
        // المرحلة الأولى: طلب أداة عبر البث
        streamingSeen = true;
        res.write(chunk({ choices: [{ delta: { role: 'assistant', content: '' } }] }));
        res.write(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '' } }] } }] }));
        res.write(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"expression":' } }] } }] }));
        res.write(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"2+2"}' } }] } }] }));
        res.write(chunk({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // المرحلة الثانية: بث الرد النهائي كلمة كلمة
      streamingSeen = true;
      const words = ['حسناً', '،', ' ناتج', ' ٢+٢', ' هو', ' 4', '.'];
      let i = 0;
      (function push() {
        if (i >= words.length) {
          res.write(chunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        res.write(chunk({ choices: [{ delta: { content: words[i++] } }] }));
        setTimeout(push, 40);
      })();
      return;
    }

    res.writeHead(404, cors);
    res.end('{}');
  });
});

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  await new Promise(r => server.listen(MOCK_PORT, r));
  console.log('سيرفر المزوّد الوهمي يعمل على المنفذ ' + MOCK_PORT);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 880 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(APP + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.App && window.App.UI && window.App.UI.currentTab), { timeout: 20000 });
  await sleep(800);

  console.log('\n[1] إضافة المزوّد الوهمي عبر الواجهة');
  await page.evaluate((port) => {
    App.Store.reset();
    App.UI.tab('providers');
    document.querySelector('[data-method="custom"]').click();
    document.getElementById('custName').value = 'Mock';
    document.getElementById('custType').value = 'openai';
    document.getElementById('custBase').value = 'http://localhost:' + port + '/v1';
    document.getElementById('custKey').value = 'test-key';
    document.getElementById('btnAddCustom').click();
  }, MOCK_PORT);
  await sleep(1500);
  let st = await page.evaluate(() => App.Store.state());
  ok('المزوّد أُضيف', st.providers.length === 1, st.providers.length);
  ok('حالة المزوّد ok', st.providers[0] && st.providers[0].status === 'ok', st.providers[0] && st.providers[0].statusText);
  ok('جُلب نموذجان', st.providers[0] && st.providers[0].models.length === 2, st.providers[0] && st.providers[0].models.length);

  console.log('\n[2] إنشاء وكيل');
  await page.evaluate(() => {
    const p = App.Store.state().providers[0];
    const a = App.Agent.create({ name: 'وكيل التجربة', providerId: p.id, model: 'mock-smart', tools: ['calculator'] });
    App.UI.activeAgentId = a.id;
    App.UI.tab('chat');
  });
  await sleep(400);
  ok('الوكيل أُنشئ', (await page.evaluate(() => App.Store.state().agents.length)) === 1);

  console.log('\n[3] إرسال رسالة (بالبث افتراضيًا) — هذا هو الاختبار الحاسم');
  await page.evaluate(() => { document.getElementById('chatInput').value = 'كم 2+2؟'; });
  await page.evaluate(() => document.getElementById('btnSend').click());
  await sleep(4000);

  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('#chatMessages .msg')].map(m => m.className + ' :: ' + m.textContent.trim().slice(0, 90)));
  console.log('   الرسائل الظاهرة:');
  bubbles.forEach(b => console.log('     - ' + b));

  const hist = await page.evaluate(() => App.Agent.history(App.UI.activeAgentId));
  ok('سجل المحادثة يحتوي على رد', hist.some(m => m.role === 'assistant' && m.content && m.content.length), JSON.stringify(hist.map(m => m.role)));
  ok('نص الرد ظاهر في الواجهة', /4/.test(await page.evaluate(() => document.getElementById('chatMessages').textContent)));
  ok('البث الحقيقي استُخدم (stream:true)', streamingSeen && lastBody && lastBody.stream === true, lastBody && lastBody.stream);
  ok('الأداة نُفّذت في الحلقة الثانية', hist.some(m => m.role === 'tool'), JSON.stringify(hist.map(m => m.role)));
  ok('زر الإرسال عاد متاحًا', await page.evaluate(() => !document.getElementById('btnSend').disabled));

  console.log('\n[4] إرسال تانٍ للتأكد أن الحلقة مستمرة');
  await page.evaluate(() => { document.getElementById('chatInput').value = 'مرة أخرى'; document.getElementById('btnSend').click(); });
  await sleep(3500);
  const hist2 = await page.evaluate(() => App.Agent.history(App.UI.activeAgentId));
  ok('المحادثة الثانية نجحت', hist2.filter(m => m.role === 'assistant').length >= 3, hist2.map(m => m.role).join(','));

  console.log('\n[5] الرد بدون بث');
  await page.evaluate(() => { App.Store.state().settings.stream = false; });
  await page.evaluate(() => { document.getElementById('chatInput').value = 'بدون بث'; document.getElementById('btnSend').click(); });
  await sleep(3000);
  ok('الرد بدون بث وصل', /رد بدون بث|النتيجة النهائية/.test(await page.evaluate(() => document.getElementById('chatMessages').textContent)));

  console.log('\n[6] مكتبة المحادثات والتسمية التلقائية');
  const conv0 = await page.evaluate(() => App.Conv.list(App.UI.activeAgentId).map(c => ({ t: c.title, n: c.messages.length })));
  ok('اسم المحادثة تلقائي', conv0[0] && conv0[0].t && conv0[0].t !== 'محادثة جديدة', conv0[0]);
  ok('الرسائل محفوظة في المحادثة', conv0[0] && conv0[0].n > 3, conv0[0] && conv0[0].n);
  await page.evaluate(() => { App.Conv.create(App.UI.activeAgentId); App.UI.renderChat(); });
  const conv1 = await page.evaluate(() => App.Conv.list(App.UI.activeAgentId).length);
  ok('إنشاء محادثة ثانية', conv1 === 2, conv1);
  ok('المحادثة الجديدة فارغة', (await page.evaluate(() => App.Agent.history(App.UI.activeAgentId).length)) === 0);
  await page.evaluate(() => { App.Conv.setActive(App.UI.activeAgentId, App.Conv.list(App.UI.activeAgentId)[1].id); App.UI.renderChat(); });
  ok('الرجوع للمحادثة الأولى يستعيد رسائلها', (await page.evaluate(() => App.Agent.history(App.UI.activeAgentId).length)) > 3);
  ok('زر قائمة المحادثات يعمل', await page.evaluate(() => { App.UI.chatList(); const okk = !document.getElementById('modal').hasAttribute('hidden'); App.UI.closeModal(); return okk; }));

  console.log('\n--- أخطاء المتصفح ---');
  errs.length ? errs.forEach(e => console.log('  ' + e)) : console.log('  لا توجد أخطاء');

  await browser.close();
  server.close();
  console.log('\n' + (fail === 0 ? '🎉 نجحت كل اختبارات الطرفين (' + pass + ')' : '⚠ فشل ' + fail + ' من ' + (pass + fail)));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('انهيار:', e); process.exit(1); });
