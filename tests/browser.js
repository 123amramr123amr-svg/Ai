/* اختبار بالمتصفح الحقيقي: يلتقط أخطاء JS ويصوّر كل الشاشات */
'use strict';
const puppeteer = require('/workspace/.tools/pptr/node_modules/puppeteer');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8099';
const OUT = '/workspace/shots';
fs.mkdirSync(OUT, { recursive: true });

const SEED = {
  version: 1,
  providers: [{
    id: 'prov_demo', presetId: 'openrouter', name: 'OpenRouter', icon: 'OR', abbr: 'OR', type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxxxxxx',
    customHeader: '', modelsPath: '', referer: '', freeOnly: false,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', free: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', free: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o', free: false }
    ],
    status: 'ok', statusText: '3 نموذج متاح', keyHint: 'sk-o••••xxxx',
    addedAt: Date.now(), lastChecked: Date.now()
  }],
  agents: [{
    id: 'agent_demo', name: 'مساعد التسويق', emoji: 'MK', providerId: 'prov_demo',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    system: 'أنت مساعد تسويق محترف.', temperature: 0.7, maxTokens: 0,
    tools: ['calculator', 'current_time'], createdAt: Date.now()
  }],
  chats: {
    agent_demo: [
      { role: 'user', content: 'اكتب لي ٣ أفكار لمحتوى تسويقي.', ts: Date.now() - 60000 },
      { role: 'tool', name: 'calculator', toolArgs: { expression: '2*3' }, content: '6', ts: Date.now() - 50000 },
      { role: 'assistant', content: '## ثلاثة محاور\n\n1. **قصة العميل** — قبل/بعد.\n2. مقارنة سريعة مع البديل.\n3. كواليس التصنيع.\n\n```js\nconst idea = "before/after";\n```', ts: Date.now() - 40000 }
    ]
  },
  settings: { theme: 'dark', stream: true, confirmDelete: true, appName: 'مساحة الوكلاء' }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const errors = [];

  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 880, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.App && window.App.UI && window.App.UI.currentTab), { timeout: 20000 });
  await sleep(1000);

  console.log('النافذة المنبثقة عند الإقلاع:', JSON.stringify(await page.evaluate(() => {
    const m = document.getElementById('modal');
    return { hidden: m.hidden, display: getComputedStyle(m).display };
  })));
  console.log('شاشة البداية اختفت:', await page.evaluate(() => {
    const s = document.getElementById('splash');
    return !s || s.classList.contains('hide') || getComputedStyle(s).opacity === '0';
  }));
  console.log('العنصر في مركز الشاشة:', await page.evaluate(() => {
    const el = document.elementFromPoint(200, 400);
    return el ? (el.id || el.className || el.tagName) : 'none';
  }));
  await page.screenshot({ path: OUT + '/01-providers-empty.png' });

  await page.evaluate((seed) => {
    localStorage.setItem('ai_agents_space_v1', JSON.stringify(seed));
    App.Store._s = null;
    App.Store.load();
    App.UI.tab('providers');
  }, SEED);
  await sleep(500);
  await page.screenshot({ path: OUT + '/02-providers.png' });


  await page.evaluate(() => App.UI.tab('agents')); await sleep(400);
  await page.screenshot({ path: OUT + '/03-agents.png' });

  await page.evaluate(() => { App.UI.activeAgentId = 'agent_demo'; App.UI.tab('chat'); }); await sleep(500);
  await page.screenshot({ path: OUT + '/04-chat.png' });

  await page.evaluate(() => App.UI.tab('settings')); await sleep(400);
  await page.screenshot({ path: OUT + '/05-settings.png' });

  try {
    await page.evaluate(() => { App.UI.tab('agents'); App.UI.agentEditor(null); });
  } catch (e) { console.log('تعذّر فتح نافذة الوكيل:', e.message); }
  await sleep(700);
  console.log('النافذة بعد الفتح:', JSON.stringify(await page.evaluate(() => ({
    hidden: document.getElementById('modal').hidden,
    display: getComputedStyle(document.getElementById('modal')).display
  }))));
  await page.screenshot({ path: OUT + '/06-agent-editor.png' });

  await page.evaluate(() => App.UI.closeModal()); await sleep(300);
  console.log('النافذة بعد الإغلاق:', await page.evaluate(() =>
    getComputedStyle(document.getElementById('modal')).display));

  await page.evaluate(() => { App.UI.tab('providers'); App.UI.help(); }); await sleep(500);
  await page.screenshot({ path: OUT + '/07-help.png' });
  await page.evaluate(() => App.UI.closeModal()); await sleep(200);

  await page.evaluate(() => {
    App.Store.reset();
    App.UI.tab('providers');
    document.querySelector('[data-method="custom"]').click();
    document.getElementById('custName').value = 'OpenRouter بدون مفتاح';
    document.getElementById('custType').value = 'openai';
    document.getElementById('custBase').value = 'https://openrouter.ai/api/v1';
    document.getElementById('btnTestCustom').click();
  });
  await sleep(8000);
  console.log('نتيجة الاختبار الحيّ:',
    (await page.evaluate(() => document.getElementById('customResult').textContent)).slice(0, 150));
  await page.screenshot({ path: OUT + '/08-live-test.png' });

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    App.UI.tab('providers');
  });
  await sleep(400);
  await page.screenshot({ path: OUT + '/09-light.png' });

  console.log('\n--- الأخطاء ---');
  if (errors.length) errors.forEach(e => console.log('  ' + e));
  else console.log('  لا توجد أخطاء');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('انهيار:', e.message); process.exit(1); });
