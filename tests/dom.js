/* اختبار الواجهة كاملة داخل DOM حقيقي (jsdom) مع مزوّد وهمي */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/workspace/.tools/pptr/node_modules/jsdom');

const ROOT = '/workspace';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

let chatStep = 0;
const calls = [];
function jsonResponse(obj, status) {
  const text = JSON.stringify(obj);
  return {
    status: status || 200,
    headers: { forEach(cb) { cb('application/json', 'content-type'); } },
    text: () => Promise.resolve(text),
    body: null
  };
}
function mockFetch(url, init) {
  calls.push(((init && init.method) || 'GET') + ' ' + url);
  if (/\/key$/.test(url)) return Promise.resolve(jsonResponse({ data: { label: 'demo', usage: 0 } }));
  if (/\/models/.test(url)) {
    return Promise.resolve(jsonResponse({
      data: [
        { id: 'demo-chat', name: 'Demo Chat' },
        { id: 'demo-free:free', name: 'Demo Free', pricing: { prompt: '0', completion: '0' } }
      ]
    }));
  }
  if (/\/chat\/completions/.test(url)) {
    chatStep++;
    if (chatStep === 1) {
      return Promise.resolve(jsonResponse({
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } }] } }]
      }));
    }
    return Promise.resolve(jsonResponse({
      choices: [{ message: { role: 'assistant', content: 'الناتج النهائي هو 4.' } }],
      usage: { total_tokens: 12 }
    }));
  }
  return Promise.resolve(jsonResponse({ error: { message: 'مسار غير معروف' } }, 404));
}

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', e => {
  const m = String(e.message || e);
  if (/Not implemented/.test(m)) return; // قيود jsdom وليست أخطاء التطبيق
  pageErrors.push('jsdomError: ' + m);
});

  const dom = new JSDOM(html, {
    url: 'http://localhost:8099/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: 'usable',
    beforeParse(window) {
      window.fetch = mockFetch;
      window.confirm = () => true;
      window.alert = () => {};
    }
  });
  const win = dom.window;
  const doc = win.document;

  await new Promise(res => win.addEventListener('load', res));
  await sleep(900);

  const App = win.App, UI = App.UI;
  const $ = (s) => doc.querySelector(s);

  console.log('\n[1] الإقلاع');
  ok('التطبيق يعمل (App موجود)', !!App && !!App.UI);
  ok('لا أخطاء عند التحميل', pageErrors.length === 0, pageErrors.join(' | '));
  ok('كل السكربتات محمّلة', typeof App.Chat.send === 'function' && typeof App.Agent.run === 'function');
  ok('التبويب الافتراضي = المزوّدون', UI.currentTab === 'providers', UI.currentTab);
  ok('النافذة المنبثقة مخفية عند الإقلاع', $('#modal').hasAttribute('hidden'));
  ok('قائمة المزوّدين الجاهزة مملوءة', $('#presetSelect').options.length > 10, $('#presetSelect').options.length);

  console.log('\n[2] التبديل بين التبويبات');
  ['agents', 'chat', 'settings', 'providers'].forEach(name => {
    UI.tab(name);
    const shown = [...doc.querySelectorAll('.view')].filter(v => !v.hasAttribute('hidden'));
    ok('تبويب ' + name + ' يظهر وحده', shown.length === 1 && shown[0].getAttribute('data-view') === name, shown.length);
  });

  console.log('\n[3] إضافة مزوّد جاهز (OpenRouter): تحقّق ثم جلب النماذج');
  UI.tab('providers');
  $('#presetSelect').value = 'openrouter';
  UI.presetChanged();
  $('#presetKey').value = 'sk-or-v1-fake-for-test';
  $('#btnAddPreset').click();
  await sleep(700);
  const provs = App.Store.state().providers;
  ok('تمت إضافة المزوّد', provs.length === 1, provs.length);
  ok('حالة المزوّد = ok', provs[0] && provs[0].status === 'ok', provs[0] && provs[0].status);
  ok('جُلب نموذجان', provs[0] && provs[0].models.length === 2, provs[0] && provs[0].models.length);
  ok('النموذج المجاني موسوم', provs[0] && provs[0].models.filter(m => m.free).length === 1);
  ok('رسالة النجاح ظهرت', /تم/.test($('#presetHint').textContent), $('#presetHint').textContent);
  ok('ظهر في القائمة', /OpenRouter/.test($('#providerList').textContent));
  ok('تحقّق قبل الجلب', calls.some(c => /\/key$/.test(c)) && calls.some(c => /\/models/.test(c)), calls.join(' , '));

  console.log('\n[4] رفض المفتاح الخاطئ (لا يُحفظ أي شيء)');
  const before = App.Store.state().providers.length;
  const realFetch = win.fetch;
  win.fetch = () => Promise.resolve(jsonResponse({ error: { message: 'Incorrect API key provided' } }, 401));
  $('#presetSelect').value = 'openai';
  UI.presetChanged();
  $('#presetKey').value = 'sk-bad-key';
  $('#btnAddPreset').click();
  await sleep(600);
  ok('لم يُضف مزوّد جديد', App.Store.state().providers.length === before, App.Store.state().providers.length);
  ok('ظهرت رسالة الخطأ', /Incorrect API key/.test($('#presetHint').textContent), $('#presetHint').textContent);
  win.fetch = realFetch;

  console.log('\n[5] الاكتشاف التلقائي من شكل المفتاح');
  $('#pasteKey').value = 'AIzaSyD-fake-google-key';
  $('#btnAutoDetect').click();
  await sleep(200);
  ok('تعرّف على Google', /Google/.test($('#detectResult').textContent), $('#detectResult').textContent);
  $('#pasteKey').value = 'gsk_fake_groq';
  $('#btnAutoDetect').click();
  await sleep(200);
  ok('تعرّف على Groq', /Groq/.test($('#detectResult').textContent), $('#detectResult').textContent);

  console.log('\n[6] الإضافة التلقائية بالتحقق');
  $('#pasteKey').value = 'sk-or-v1-auto-detect';
  $('#btnAutoAdd').click();
  await sleep(1000);
  ok('أُضيف تلقائيًا', App.Store.state().providers.length === before + 1, App.Store.state().providers.length);

  console.log('\n[7] إنشاء وكيل من الواجهة');
  const provId = App.Store.state().providers[0].id;
  UI.agentEditor(null, { providerId: provId });
  await sleep(200);
  ok('نافذة الوكيل مفتوحة', !$('#modal').hasAttribute('hidden'));
  ok('قائمة النماذج مملوءة', $('#aeModel').options.length === 2, $('#aeModel').options.length);
  $('#aeName').value = 'وكيل الاختبار';
  $('#aeSystem').value = 'أنت مساعد اختبار.';
  doc.querySelectorAll('#modalBox .chk input')[0].checked = true;
  $('#aeSave').click();
  await sleep(300);
  const agents = App.Store.state().agents;
  ok('أُنشئ الوكيل', agents.length === 1 && agents[0].name === 'وكيل الاختبار', agents.length);
  ok('الأداة محفوظة', agents[0] && agents[0].tools.length === 1, agents[0] && JSON.stringify(agents[0].tools));
  ok('النافذة أُغلقت', $('#modal').hasAttribute('hidden'));

  console.log('\n[8] محادثة مع استدعاء أداة (حلقة الأدوات)');
  App.Store.state().settings.stream = false;
  UI.activeAgentId = agents[0].id;
  UI.tab('chat');
  $('#chatInput').value = 'كم ناتج 2+2؟';
  $('#btnSend').click();
  await sleep(1800);
  const hist = App.Agent.history(agents[0].id);
  const roles = hist.map(m => m.role).join(',');
  ok('التسلسل: مستخدم ← مساعد(أداة) ← أداة ← مساعد', roles === 'user,assistant,tool,assistant', roles);
  ok('نُفّذت الحاسبة وأعادت 4', hist[2] && hist[2].content === '4', hist[2] && hist[2].content);
  ok('ظهر الرد النهائي', /الناتج النهائي/.test($('#chatMessages').textContent));
  ok('ظهرت خطوة الأداة', /calculator/.test($('#chatMessages').textContent));
  ok('زر الإرسال رجع متاحًا', !$('#btnSend').disabled);

  console.log('\n[9] الأخطاء');
  ok('لا أخطاء JS خلال كل السيناريوهات', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n' + (fail === 0 ? '🎉 كل اختبارات الواجهة نجحت (' + pass + ')' : '⚠ فشل ' + fail + ' من ' + (pass + fail)));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('انهيار الاختبار:', e); process.exit(1); });
