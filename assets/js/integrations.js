/* ==========================================================================
   integrations.js — التكاملات: GitHub (إنشاء مشاريع) · تليجرام · Webhooks
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util;

  var DEFAULTS = {
    github: { enabled: false, token: '', owner: '', defaultRepo: '', user: '' },
    telegram: { enabled: false, token: '', agentId: '', offset: 0, botName: '', log: [] },
    webhook: { enabled: false, url: '' }
  };

  function st() { return App.Store.state(); }
  function cfg(key) {
    if (!st().integrations) st().integrations = {};
    if (!st().integrations[key]) st().integrations[key] = U.clone(DEFAULTS[key] || {});
    var d = DEFAULTS[key] || {};
    for (var k in d) if (!(k in st().integrations[key])) st().integrations[key][k] = d[k];
    return st().integrations[key];
  }
  function saveCfg() { App.Store.save(); }

  /* ============================== GitHub ============================== */
  var GH = 'https://api.github.com';

  function gh(method, path, body) {
    var c = cfg('github');
    if (!c.token) return Promise.reject(new Error('GitHub غير مربوط — أضف التوكن من تبويب التكاملات.'));
    var headers = {
      'Authorization': 'Bearer ' + c.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AI-Agents-Space'
    };
    if (body) headers['Content-Type'] = 'application/json';
    return App.Http.request({
      url: GH + path, method: method, headers: headers,
      body: body ? JSON.stringify(body) : undefined, timeout: 90000
    }).then(function (r) {
      var j = null;
      try { j = JSON.parse(r.text); } catch (e) { }
      if (r.status < 200 || r.status >= 300) {
        var m = (j && j.message) || ('HTTP ' + r.status);
        if (j && j.errors) m += ' — ' + JSON.stringify(j.errors);
        throw new Error(m);
      }
      return j;
    });
  }

  function repoOf(a) {
    var c = cfg('github');
    return a.repo || c.defaultRepo;
  }

  function ghPath(a, suffix) {
    var c = cfg('github');
    return '/repos/' + (c.owner || a.owner || '') + '/' + repoOf(a) + suffix;
  }

  var GITHUB_TOOLS = {
    gh_whoami: {
      label: 'حساب GitHub', desc: 'معرفة الحساب المربوط في GitHub',
      parameters: { type: 'object', properties: {} },
      run: function () {
        return gh('GET', '/user').then(function (u) {
          return 'الحساب: ' + u.login + ' · ' + (u.name || '') + ' · مستودعات: ' + u.public_repos;
        });
      }
    },
    gh_list_repos: {
      label: 'مستودعاتي', desc: 'سرد مستودعاتك في GitHub',
      parameters: { type: 'object', properties: {
        limit: { type: 'number', description: 'عدد النتائج (افتراضي 20)' } } },
      run: function (a) {
        return gh('GET', '/user/repos?per_page=' + (a.limit || 20) + '&sort=updated')
          .then(function (arr) {
            return arr.map(function (r) { return r.full_name + (r.private ? ' (خاص)' : ''); }).join('\n');
          });
      }
    },
    gh_create_repo: {
      label: 'إنشاء مستودع', desc: 'إنشاء مستودع (مشروع) جديد على GitHub',
      parameters: { type: 'object', properties: {
        name: { type: 'string', description: 'اسم المستودع بالإنجليزية بدون مسافات' },
        description: { type: 'string' },
        private: { type: 'boolean', description: 'هل يكون خاصًا؟' }
      }, required: ['name'] },
      run: function (a) {
        return gh('POST', '/user/repos', {
          name: String(a.name).replace(/[^A-Za-z0-9._-]/g, '-'),
          description: a.description || 'أُنشئ بواسطة مساحة الوكلاء',
          private: !!a.private, auto_init: true
        }).then(function (r) { return 'أُنشئ المستودع: ' + r.full_name + '\n' + r.html_url; });
      }
    },
    gh_write_file: {
      label: 'كتابة ملف', desc: 'إنشاء أو تعديل ملف داخل مستودع (لبناء المشاريع)',
      parameters: { type: 'object', properties: {
        repo: { type: 'string', description: 'اسم المستودع (اختياري إن كان الافتراضي مضبوطًا)' },
        path: { type: 'string', description: 'مسار الملف مثل src/index.js' },
        content: { type: 'string', description: 'محتوى الملف كاملًا' },
        message: { type: 'string', description: 'رسالة الـ commit' },
        branch: { type: 'string', description: 'الفرع (افتراضي main)' }
      }, required: ['path', 'content'] },
      run: function (a) {
        var repo = repoOf(a);
        if (!repo) return 'حدّد اسم المستودع أولًا.';
        var url = ghPath(a, '/contents/' + String(a.path).split('/').map(encodeURIComponent).join('/'));
        return gh('GET', url + '?ref=' + (a.branch || 'main'))
          .then(function (j) { return j && j.sha; }, function () { return null; })
          .then(function (sha) {
            var body = {
              message: a.message || ('إضافة ' + a.path),
              content: U.b64enc(String(a.content == null ? '' : a.content))
            };
            if (a.branch) body.branch = a.branch;
            if (sha) body.sha = sha;
            return gh('PUT', url, body);
          })
          .then(function (j) { return 'تم الحفظ: ' + a.path + '\n' + ((j.content && j.content.html_url) || ''); });
      }
    },
    gh_read_file: {
      label: 'قراءة ملف', desc: 'قراءة ملف من مستودع',
      parameters: { type: 'object', properties: {
        repo: { type: 'string' }, path: { type: 'string' } }, required: ['path'] },
      run: function (a) {
        var url = ghPath(a, '/contents/' + String(a.path).split('/').map(encodeURIComponent).join('/'));
        return gh('GET', url).then(function (j) {
          if (Array.isArray(j)) return j.map(function (x) { return x.name; }).join('\n');
          return (j.content ? U.b64dec(j.content.replace(/\n/g, '')) : '').slice(0, 8000);
        });
      }
    },
    gh_create_issue: {
      label: 'إنشاء مهمة', desc: 'فتح Issue في مستودع',
      parameters: { type: 'object', properties: {
        repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } },
        required: ['title'] },
      run: function (a) {
        return gh('POST', ghPath(a, '/issues'), { title: a.title, body: a.body || '' })
          .then(function (r) { return 'أُنشئت المهمة: ' + r.html_url; });
      }
    },
    gh_list_issues: {
      label: 'المهام المفتوحة', desc: 'سرد Issues المفتوحة',
      parameters: { type: 'object', properties: { repo: { type: 'string' } } },
      run: function (a) {
        return gh('GET', ghPath(a, '/issues?state=open&per_page=30')).then(function (arr) {
          return arr.filter(function (i) { return !i.pull_request; })
            .map(function (i) { return '#' + i.number + ' ' + i.title; }).join('\n') || 'لا مهام مفتوحة.';
        });
      }
    }
  };

  /* ============================== تليجرام ============================== */
  var TG_RUNNING = false;

  /** يُبقي التطبيق حيًّا في الخلفية داخل نسخة أندرويد. */
  function keepAlive(on) {
    try {
      if (window.NativeApp && window.NativeApp.keepAlive) window.NativeApp.keepAlive(!!on);
    } catch (e) { }
  }

  function tg(method, params, timeout) {
    var c = cfg('telegram');
    if (!c.token) return Promise.reject(new Error('تليجرام غير مربوط — أضف توكن البوت.'));
    return App.Http.request({
      url: 'https://api.telegram.org/bot' + c.token + '/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
      timeout: timeout || 45000
    }).then(function (r) {
      var j = null; try { j = JSON.parse(r.text); } catch (e) { }
      if (!j || !j.ok) throw new Error((j && j.description) || ('HTTP ' + r.status));
      return j.result;
    });
  }

  function tgLog(dir, text) {
    var c = cfg('telegram');
    if (!c.log) c.log = [];
    c.log.push({ ts: Date.now(), dir: dir, text: String(text).slice(0, 300) });
    if (c.log.length > 30) c.log.shift();
    saveCfg();
    if (App.UI && App.UI.renderIntegrations && App.UI.currentTab === 'integrations') App.UI.renderIntegrations();
  }

  function tgVerify(token) {
    var c = cfg('telegram');
    if (token) { c.token = token.trim(); saveCfg(); }
    return tg('getMe').then(function (me) {
      c.botName = me.username || me.first_name || 'bot';
      saveCfg();
      return c.botName;
    });
  }

  function splitText(t, max) {
    t = String(t || '');
    var out = [];
    while (t.length > max) {
      var cut = t.lastIndexOf('\n', max);
      if (cut < max * 0.5) cut = max;
      out.push(t.slice(0, cut));
      t = t.slice(cut);
    }
    if (t) out.push(t);
    return out;
  }

  function convForTelegram(c, agentId, msg) {
    if (!c.chats) c.chats = {};
    var key = String(msg.chat.id);
    var arr = App.Conv.list(agentId);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === c.chats[key]) return arr[i];
    var name = (msg.from && (msg.from.first_name || msg.from.username)) || key;
    var conv = App.Conv.create(agentId, 'تليجرام · ' + name);
    c.chats[key] = conv.id;
    saveCfg();
    return conv;
  }

  function tgHandle(msg) {
    var c = cfg('telegram');
    var agent = App.Agent.get(c.agentId);
    var chatId = msg.chat.id;
    if (!agent) { tg('sendMessage', { chat_id: chatId, text: 'لم يتم اختيار وكيل بعد.' }); return; }

    if (/^\/(start|help)/.test(msg.text)) {
      tg('sendMessage', { chat_id: chatId, text: 'مرحبًا! أنا ' + (c.botName || 'الوكيل') + ' — اكتب رسالتك وسأرد عليك.' });
      tgLog('in', msg.text);
      return;
    }

    tgLog('in', msg.text);
    var conv = convForTelegram(c, agent.id, msg);
    App.Conv.setActive(agent.id, conv.id);
    App.Agent.append(agent.id, { role: 'user', content: msg.text, via: 'telegram' });

    tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(function () { });

    App.Agent.run(agent, {}).then(function (r) {
      var parts = splitText(r.text || '(لا رد)', 3800);
      var chain = Promise.resolve();
      parts.forEach(function (p) {
        chain = chain.then(function () { return tg('sendMessage', { chat_id: chatId, text: p }); });
      });
      return chain;
    }).then(function () {
      tgLog('out', 'تم إرسال الرد');
    }).catch(function (e) {
      tg('sendMessage', { chat_id: chatId, text: 'تعذّر توليد الرد: ' + e.message }).catch(function () { });
      tgLog('err', e.message);
    });
  }

  function tgLoop() {
    if (!TG_RUNNING) return;
    var c = cfg('telegram');
    if (!c.enabled || !c.token) { TG_RUNNING = false; return; }
    tg('getUpdates', { offset: c.offset, timeout: 25, allowed_updates: ['message'] })
      .then(function (res) {
        (res || []).forEach(function (u) {
          c.offset = u.update_id + 1;
          if (u.message && u.message.text) tgHandle(u.message);
        });
        saveCfg();
        setTimeout(tgLoop, 400);
      })
      .catch(function (e) {
        tgLog('err', e.message);
        setTimeout(tgLoop, 6000);
      });
  }

  function tgStart() {
    var c = cfg('telegram');
    if (!c.token) return Promise.reject(new Error('أضف توكن البوت أولًا'));
    if (!c.agentId) return Promise.reject(new Error('اختر الوكيل الذي سيرد'));
    return tg('deleteWebhook', { drop_pending_updates: false })
      .catch(function () { })
      .then(function () {
        c.enabled = true; saveCfg();
        if (!TG_RUNNING) { TG_RUNNING = true; tgLoop(); }
        keepAlive(true);
        tgLog('sys', 'تم تشغيل الاستقبال');
        return true;
      });
  }

  function tgStop() {
    var c = cfg('telegram');
    c.enabled = false; saveCfg();
    TG_RUNNING = false;
    keepAlive(false);
    tgLog('sys', 'تم الإيقاف');
    return Promise.resolve(true);
  }

  /* ============================== Webhooks ============================== */
  function postWebhook(text, url) {
    var c = cfg('webhook');
    var target = url || c.url;
    if (!target) return Promise.reject(new Error('أضف رابط الـ Webhook أولًا'));
    var payload = { text: String(text == null ? '' : text), content: String(text == null ? '' : text) };
    return App.Http.request({
      url: target, method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), timeout: 30000
    }).then(function (r) {
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
      return 'تم الإرسال (' + r.status + ')';
    });
  }

  var WEBHOOK_TOOLS = {
    send_webhook: {
      label: 'إرسال Webhook', desc: 'إرسال رسالة أو تقرير إلى رابط Webhook (Slack / Discord / أي خدمة)',
      parameters: { type: 'object', properties: {
        text: { type: 'string', description: 'النص المراد إرساله' },
        url: { type: 'string', description: 'رابط بديل (اختياري)' }
      }, required: ['text'] },
      run: function (a) { return postWebhook(a.text, a.url); }
    }
  };

  /* ============================== الواجهة البرمجية ============================== */
  function tools() {
    var out = [];
    var g = cfg('github');
    if (g.enabled && g.token) {
      for (var k in GITHUB_TOOLS) out.push(mkTool(k, GITHUB_TOOLS[k], 'github'));
    }
    if (cfg('webhook').enabled && cfg('webhook').url) {
      for (var w in WEBHOOK_TOOLS) out.push(mkTool(w, WEBHOOK_TOOLS[w], 'webhook'));
    }
    return out;
  }

  function mkTool(name, def, group) {
    return { name: name, label: def.label, desc: def.desc, parameters: def.parameters, group: group, run: def.run };
  }

  function allDefs() {
    var out = {};
    for (var k in GITHUB_TOOLS) out[k] = GITHUB_TOOLS[k];
    for (var w in WEBHOOK_TOOLS) out[w] = WEBHOOK_TOOLS[w];
    return out;
  }

  function verifyGithub(token, owner) {
    var c = cfg('github');
    if (token) c.token = token.trim();
    if (owner) c.owner = owner.trim();
    if (!c.token) return Promise.reject(new Error('أدخل التوكن أولًا'));
    return gh('GET', '/user').then(function (u) {
      c.user = u.login;
      if (!c.owner) c.owner = u.login;
      c.enabled = true;
      saveCfg();
      return u.login;
    });
  }

  function disconnectGithub() {
    var c = cfg('github');
    c.token = ''; c.enabled = false; c.user = '';
    saveCfg();
  }

  App.Integrations = {
    cfg: cfg,
    save: saveCfg,
    tools: tools,
    allDefs: allDefs,
    verifyGithub: verifyGithub,
    disconnectGithub: disconnectGithub,
    postWebhook: postWebhook,
    tgVerify: tgVerify,
    tgStart: tgStart,
    tgStop: tgStop,
    tgRunning: function () { return TG_RUNNING; },
    tgLog: function () { return cfg('telegram').log || []; },
    isEnabled: function (key) { return !!cfg(key).enabled; },
    resumeTelegram: function () {
      var c = cfg('telegram');
      if (c.enabled && c.token && c.agentId && !TG_RUNNING) { TG_RUNNING = true; tgLoop(); keepAlive(true); }
    }
  };
})();
