/* اختبار حيّ: يتأكد أن التحقق من المفتاح وجلب النماذج يعملان فعليًا عبر الشبكة */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

global.window = global;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } };
global.document = { querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, readyState: 'complete' };

['core', 'providers', 'chat', 'tools', 'agent'].forEach(function (n) {
  eval(fs.readFileSync(path.join(root, 'assets/js', n + '.js'), 'utf8')); // eslint-disable-line no-eval
});
const App = window.App, P = App.Providers;

function mk(presetId, key) {
  const pre = P.preset(presetId);
  return P.makeProvider({ presetId: presetId, baseUrl: pre.baseUrl, type: pre.type, apiKey: key });
}

(async function () {
  let fail = 0;
  const check = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (c ? '' : ' → ' + extra)); if (!c) fail++; };

  console.log('\n[حقيقي] OpenRouter: قائمة النماذج العامة (بدون مفتاح)');
  try {
    const models = await P.fetchModels(mk('openrouter', ''));
    const free = models.filter(m => m.free).length;
    console.log('  عدد النماذج: ' + models.length + ' | مجانية: ' + free);
    check('جلب مئات النماذج من OpenRouter', models.length > 50, models.length);
    check('يوجد نماذج مجانية موسومة', free > 0, free);
    console.log('  أمثلة مجانية: ' + models.filter(m => m.free).slice(0, 3).map(m => m.id).join(', '));
  } catch (e) { check('جلب نماذج OpenRouter', false, e.message); }

  console.log('\n[حقيقي] مفتاح خاطئ يجب أن يُرفض برسالة واضحة');
  for (const pid of ['openrouter', 'openai', 'deepseek', 'groq']) {
    const v = await P.validate(mk(pid, 'sk-this-is-not-a-real-key-000000'));
    check(pid + ' يرفض المفتاح الخاطئ', v.ok === false, JSON.stringify(v));
    console.log('     → ' + v.message);
  }

  console.log('\n[حقيقي] Google AI Studio بمفتاح خاطئ');
  const gv = await P.validate(mk('google', 'AIzaSyFAKEfakefakefakefakefakefakefake'));
  check('google يرفض', gv.ok === false, JSON.stringify(gv));
  console.log('     → ' + gv.message);

  console.log('\n[حقيقي] Anthropic بمفتاح خاطئ');
  const av = await P.validate(mk('anthropic', 'sk-ant-fake-000'));
  check('anthropic يرفض', av.ok === false, JSON.stringify(av));
  console.log('     → ' + av.message);

  console.log('\n' + (fail === 0 ? '🎉 كل الاختبارات الحيّة نجحت' : '⚠ فشل ' + fail));
  process.exit(fail ? 1 : 0);
})();
