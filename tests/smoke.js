/* اختبار سريع لمنطق التطبيق في Node (بدون متصفح) */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
global.window = global;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
global.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  readyState: 'complete'
};
try { global.navigator = { clipboard: null }; } catch (e) { /* Node يعرّفه كخاصية للقراءة فقط */ }

['core', 'providers', 'chat', 'tools', 'agent', 'ui'].forEach(function (n) {
  const code = fs.readFileSync(path.join(root, 'assets/js', n + '.js'), 'utf8');
  eval(code); // eslint-disable-line no-eval
});

const App = window.App;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

console.log('\n[1] اكتشاف المزوّد من شكل المفتاح');
ok('OpenRouter sk-or-', App.Providers.detectCandidates('sk-or-v1-abc')[0] === 'openrouter');
ok('Anthropic sk-ant-', App.Providers.detectCandidates('sk-ant-api03-x')[0] === 'anthropic');
ok('Google AIza', App.Providers.detectCandidates('AIzaSyABC')[0] === 'google');
ok('Groq gsk_', App.Providers.detectCandidates('gsk_123')[0] === 'groq');
ok('OpenAI sk- يتضمن openai', App.Providers.detectCandidates('sk-abc').indexOf('openai') >= 0);
ok('xAI', App.Providers.detectCandidates('xai-abc')[0] === 'xai');

console.log('\n[2] بناء الترويسات لكل نوع مزوّد');
const openaiP = { presetId: 'openai', type: 'openai', apiKey: 'K1', baseUrl: 'https://api.openai.com/v1', models: [] };
const gemP = { presetId: 'google', type: 'gemini', apiKey: 'K2', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: [] };
const antP = { presetId: 'anthropic', type: 'anthropic', apiKey: 'K3', baseUrl: 'https://api.anthropic.com/v1', models: [] };
ok('Bearer لـ OpenAI', App.Providers.headersFor(openaiP).Authorization === 'Bearer K1');
ok('x-goog-api-key لـ Gemini', App.Providers.headersFor(gemP)['x-goog-api-key'] === 'K2');
ok('x-api-key + version لـ Anthropic',
  App.Providers.headersFor(antP)['x-api-key'] === 'K3' && !!App.Providers.headersFor(antP)['anthropic-version']);
ok('روابط النماذج (Gemini ?key=)',
  App.Providers.modelsUrl(gemP).indexOf('key=K2') > 0);
ok('مزوّد مخصص بترويسة header',
  App.Providers.headersFor({ presetId: 'custom', type: 'openai', apiKey: 'K9', customHeader: 'X-Api-Key: {key}', baseUrl: 'https://x' })['X-Api-Key'] === 'K9');

console.log('\n[3] تحليل قوائم النماذج');
const openaiModels = App.Providers.parseModels(openaiP, { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] });
ok('OpenAI models = 2', openaiModels.length === 2, JSON.stringify(openaiModels.map(m => m.id)));
const gemModels = App.Providers.parseModels(gemP, {
  models: [
    { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
  ]
});
ok('Gemini يستبعد غير generateContent', gemModels.length === 1 && gemModels[0].id === 'gemini-1.5-flash');
const orModels = App.Providers.parseModels({ presetId: 'openrouter', type: 'openai' }, {
  data: [
    { id: 'meta/llama-3:free', name: 'Llama free', pricing: { prompt: '0', completion: '0' } },
    { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.005', completion: '0.015' } }
  ]
});
ok('OpenRouter يوسم المجاني', orModels.filter(m => m.free).length === 1 && orModels.filter(m => m.free)[0].id === 'meta/llama-3:free');

console.log('\n[4] تحويل الرسائل (tools) لكل مزوّد');
const msgs = [
  { role: 'user', content: 'مرحبا' },
  { role: 'assistant', content: 'لحظة', toolCalls: [{ id: 'c1', name: 'calculator', args: { expression: '1+1' } }] },
  { role: 'tool', toolCallId: 'c1', name: 'calculator', content: '2' }
];
const oa = App.Chat._util.toOpenAIMessages(msgs, 'sys');
ok('OpenAI: tool_calls مُهيّأة', oa[2].tool_calls && oa[2].tool_calls[0].function.name === 'calculator');
ok('OpenAI: role=tool مع tool_call_id', oa[3].role === 'tool' && oa[3].tool_call_id === 'c1');
const an = App.Chat._util.toAnthropic(msgs, 'sys');
ok('Anthropic: tool_use + tool_result',
  an[1].content[1].type === 'tool_use' && an[2].content[0].type === 'tool_result');
const gm = App.Chat._util.toGemini(msgs);
ok('Gemini: functionCall + functionResponse',
  gm[1].parts[1].functionCall.name === 'calculator' && gm[2].parts[0].functionResponse.name === 'calculator');

console.log('\n[5] الأدوات');
App.Tools.run('calculator', { expression: '(12*7)+3' }).then(function (r) {
  ok('الحاسبة 87', r === '87', r);
  return App.Tools.run('calculator', { expression: 'process.exit(1)' });
}).then(function (r) {
  ok('الحاسبة ترفض الكود', r.indexOf('غير مسموح') >= 0, r);
  return App.Tools.run('current_time', {});
}).then(function (r) {
  ok('أداة الوقت تعمل', r.length > 10);

  console.log('\n[6] الماركداون');
  const md = App.UI.md('**عريض** و `كود`\n```js\nlet x=1;\n```');
  ok('عريض', md.indexOf('<b>عريض</b>') >= 0);
  ok('كود سطري', md.indexOf('<code>كود</code>') >= 0);
  ok('كتلة كود', md.indexOf('<pre>') >= 0);

  console.log('\n[7] المخزن');
  const st = App.Store.state();
  ok('الحالة الافتراضية', Array.isArray(st.providers) && Array.isArray(st.agents));
  const ag = App.Agent.create({ name: 'تجربة', providerId: 'x', model: 'y' });
  ok('إنشاء وكيل', App.Agent.get(ag.id).name === 'تجربة');
  App.Agent.append(ag.id, { role: 'user', content: 'hi' });
  ok('إلحاق رسالة', App.Agent.history(ag.id).length === 1);
  App.Agent.remove(ag.id);
  ok('حذف وكيل', App.Agent.get(ag.id) === null);

  console.log('\n' + (fail === 0 ? '🎉 كل الاختبارات نجحت (' + pass + ')' : '⚠ فشل ' + fail + ' من ' + (pass + fail)));
  process.exit(fail === 0 ? 0 : 1);
});
