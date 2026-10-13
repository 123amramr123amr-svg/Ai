/* ==========================================================================
   providers.js — سجلّ المزوّدين، التحقق من المفتاح، جلب النماذج، الاكتشاف التلقائي
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util;

  var GEMINI_VER = 'v1beta';
  var ANTHROPIC_VER = '2023-06-01';

  /* ------------------------------ المزوّدون الجاهزون ------------------------------ */
  var PRESETS = [
    {
      id: 'openrouter', name: 'OpenRouter (نماذج مجانية كثيرًا)', icon: '🟣', type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1', keyPrefixes: ['sk-or-'],
      keyUrl: 'https://openrouter.ai/keys', hasFree: true,
      note: 'أكبر بوابة: مئات النماذج من كل الشركات، وفيها قائمة طويلة من النماذج المجانية (تظهر بوسم «مجاني»).',
      extraHeaders: { 'X-Title': 'AI Agents Space' }
    },
    {
      id: 'openai', name: 'OpenAI', icon: '⚫', type: 'openai',
      baseUrl: 'https://api.openai.com/v1', keyPrefixes: ['sk-proj-', 'sk-'],
      keyUrl: 'https://platform.openai.com/api-keys',
      note: 'النماذج الأصلية من OpenAI مثل GPT-4o و GPT-4.1 و o-series.'
    },
    {
      id: 'deepseek', name: 'DeepSeek', icon: '🐋', type: 'openai',
      baseUrl: 'https://api.deepseek.com/v1', keyPrefixes: ['sk-'],
      keyUrl: 'https://platform.deepseek.com/api_keys',
      note: 'نماذج DeepSeek مثل deepseek-chat و deepseek-reasoner.'
    },
    {
      id: 'google', name: 'Google AI Studio (Gemini)', icon: '🔷', type: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/' + GEMINI_VER, keyPrefixes: ['AIza'],
      keyUrl: 'https://aistudio.google.com/app/apikey', hasFree: true,
      note: 'مفاتيح Google AI Studio المجانية تبدأ بـ AIza — نماذج Gemini.'
    },
    {
      id: 'anthropic', name: 'Anthropic (Claude)', icon: '🟠', type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1', keyPrefixes: ['sk-ant-'],
      keyUrl: 'https://console.anthropic.com/settings/keys',
      note: 'نماذج Claude من Anthropic.'
    },
    {
      id: 'groq', name: 'Groq (سريع جدًا)', icon: '⚡', type: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1', keyPrefixes: ['gsk_'],
      keyUrl: 'https://console.groq.com/keys', hasFree: true,
      note: 'استدلال فائق السرعة، وعنده طبقة مجانية سخية.'
    },
    {
      id: 'mistral', name: 'Mistral AI', icon: '🌪', type: 'openai',
      baseUrl: 'https://api.mistral.ai/v1', keyPrefixes: [],
      keyUrl: 'https://console.mistral.ai/api-keys', hasFree: true,
      note: 'نماذج Mistral و Codestral.'
    },
    {
      id: 'together', name: 'Together AI', icon: '🤝', type: 'openai',
      baseUrl: 'https://api.together.xyz/v1', keyPrefixes: [],
      keyUrl: 'https://api.together.ai/settings/api-keys', hasFree: true,
      note: 'مئات النماذج مفتوحة المصدر.'
    },
    {
      id: 'xai', name: 'xAI (Grok)', icon: '✖️', type: 'openai',
      baseUrl: 'https://api.x.ai/v1', keyPrefixes: ['xai-'],
      keyUrl: 'https://console.x.ai',
      note: 'نماذج Grok من xAI.'
    },
    {
      id: 'fireworks', name: 'Fireworks AI', icon: '🎆', type: 'openai',
      baseUrl: 'https://api.fireworks.ai/inference/v1', keyPrefixes: ['fw_'],
      keyUrl: 'https://fireworks.ai/account/api-keys',
      note: 'نماذج استدلال مفتوحة بسرعة عالية.'
    },
    {
      id: 'cerebras', name: 'Cerebras', icon: '🧠', type: 'openai',
      baseUrl: 'https://api.cerebras.ai/v1', keyPrefixes: ['csk-'],
      keyUrl: 'https://cloud.cerebras.ai',
      note: 'استدلال فائق السرعة على رقائق Cerebras.'
    },
    {
      id: 'ollama', name: 'Ollama (محلي على جهازك)', icon: '🦙', type: 'openai',
      baseUrl: 'http://localhost:11434/v1', keyPrefixes: [], noKey: true,
      keyUrl: 'https://ollama.com/download', local: true,
      note: 'يحتاج تشغيل Ollama على نفس الجهاز. لا يحتاج مفتاحًا.'
    },
    {
      id: 'lmstudio', name: 'LM Studio (محلي)', icon: '🖥', type: 'openai',
      baseUrl: 'http://localhost:1234/v1', keyPrefixes: [], noKey: true,
      keyUrl: 'https://lmstudio.ai', local: true,
      note: 'يحتاج تشغيل سيرفر LM Studio على المنفذ 1234. لا يحتاج مفتاحًا.'
    },
    {
      id: 'custom', name: '— مزوّد مخصص (أدخل الرابط بنفسك) —', icon: '🧩', type: 'openai',
      baseUrl: '', keyPrefixes: [], custom: true,
      note: 'أي سيرفر متوافق مع OpenAI (مثل vLLM أو OpenRouter clone أو سيرفرك الخاص).'
    }
  ];

  App.Providers = {
    PRESETS: PRESETS,
    preset: function (id) {
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
      return null;
    },
    list: function () { return App.Store.state().providers; },
    get: function (id) {
      var a = App.Store.state().providers;
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    },
    byModel: function (modelId) {
      var a = this.list();
      for (var i = 0; i < a.length; i++) {
        for (var j = 0; j < a[i].models.length; j++) if (a[i].models[j].id === modelId) return a[i];
      }
      return null;
    }
  };

  /* --------------------------- ترويسات وروابط --------------------------- */
  function headersFor(p, json) {
    var h = {};
    var key = p.apiKey || '';
    if (p.type === 'gemini') { if (key) h['x-goog-api-key'] = key; }
    else if (p.type === 'anthropic') {
      if (key) h['x-api-key'] = key;
      h['anthropic-version'] = ANTHROPIC_VER;
    } else if (key) { h['Authorization'] = 'Bearer ' + key; }

    if (p.customHeader && key) {
      var i = p.customHeader.indexOf(':');
      if (i > 0) h[p.customHeader.slice(0, i).trim()] = p.customHeader.slice(i + 1).trim().replace(/\{key\}/g, key);
    }
    var pre = App.Providers.preset(p.presetId);
    if (pre && pre.extraHeaders) for (var k in pre.extraHeaders) h[k] = pre.extraHeaders[k];
    if (p.referer) h['HTTP-Referer'] = p.referer;
    if (p.type === 'openai') h['X-Title'] = 'AI Agents Space';
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function modelsUrl(p) {
    var base = (p.baseUrl || '').replace(/\/+$/, '');
    var path = p.modelsPath && p.modelsPath.trim() ? p.modelsPath.trim() : '/models';
    var url = U.joinUrl(base, path);
    if (p.type === 'gemini') {
      url = U.joinUrl(base, '/models');
      if (p.apiKey) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(p.apiKey);
    }
    return url;
  }

  function chatUrl(p) {
    var base = (p.baseUrl || '').replace(/\/+$/, '');
    if (p.type === 'gemini') {
      return U.joinUrl(base, '/models/{model}:{action}');
    }
    if (p.type === 'anthropic') return U.joinUrl(base, '/messages');
    return U.joinUrl(base, '/chat/completions');
  }

  /* --------------------------- تحليل قائمة النماذج --------------------------- */
  function parseModels(p, json) {
    var out = [], arr = [];
    if (!json) return out;
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.data)) arr = json.data;
    else if (Array.isArray(json.models)) arr = json.models;

    for (var i = 0; i < arr.length; i++) {
      var m = arr[i], id = '', name = '', free = false;
      if (p.type === 'gemini') {
        id = m.name || m.id || '';
        if (id.indexOf('models/') === 0) id = id.slice(7);
        var meth = m.supportedGenerationMethods || [];
        if (meth.length && meth.indexOf('generateContent') < 0) continue;
        name = m.displayName || id;
      } else if (p.type === 'anthropic') {
        id = m.id || '';
        name = m.display_name || id;
      } else {
        id = typeof m === 'string' ? m : (m.id || '');
        name = (m.name && typeof m.name === 'string') ? m.name : id;
        if (m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0') free = true;
      }
      if (!id) continue;
      if (/:free$/.test(id) || /\(free\)/i.test(name)) free = true;
      if (m.free === true) free = true;
      out.push({ id: id, name: name, free: free, ctx: m.context_length || m.context_window || null });
    }
    out.sort(function (a, b) { return a.id.localeCompare(b.id); });
    return out;
  }

  /* --------------------------- استدعاءات الشبكة --------------------------- */
  function getJson(p, url, extraHeaders) {
    var h = headersFor(p);
    if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
    return App.Http.request({ url: url, method: 'GET', headers: h, timeout: 45000 })
      .then(function (r) {
        var json = null;
        try { json = JSON.parse(r.text); } catch (e) {}
        return { status: r.status, json: json, text: r.text };
      });
  }

  function errMessage(status, json, text) {
    if (json && json.error) {
      if (typeof json.error === 'string') return json.error;
      if (json.error.message) return json.error.message;
    }
    if (json && json.message) return json.message;
    if (status === 401 || status === 403) return 'المفتاح غير صالح أو غير مصرّح به (' + status + ')';
    if (status === 404) return 'الرابط غير صحيح — تأكّد من الـ Base URL (404)';
    if (status === 429) return 'تجاوزت الحد المسموح (429) — المفتاح صالح لكن مزدحم';
    if (text) return String(text).slice(0, 220);
    return 'رمز الاستجابة ' + status;
  }

  /* 1) التحقق من المفتاح قبل جلب النماذج */
  function validate(p) {
    var url = (p.presetId === 'openrouter')
      ? U.joinUrl(p.baseUrl, '/key')
      : modelsUrl(p);
    return getJson(p, url).then(function (r) {
      if (r.status >= 200 && r.status < 300) {
        return { ok: true, status: r.status, info: r.json, message: 'المفتاح يعمل ✅' };
      }
      return { ok: false, status: r.status, message: errMessage(r.status, r.json, r.text) };
    }).catch(function (e) {
      return { ok: false, status: 0, message: e.message || 'تعذّر الوصول للمزوّد' };
    });
  }

  /* 2) جلب النماذج المتاحة */
  function fetchModels(p) {
    return getJson(p, modelsUrl(p)).then(function (r) {
      if (r.status < 200 || r.status >= 300) {
        var e = new Error(errMessage(r.status, r.json, r.text));
        e.status = r.status;
        throw e;
      }
      var models = parseModels(p, r.json);
      return models;
    }).catch(function (e) {
      if (e.status) throw e;
      // محاولة احتياطية: بعض السيرفرات لا تدعم /models
      throw new Error(e.message || 'تعذّر جلب قائمة النماذج');
    });
  }

  App.Providers.headersFor = headersFor;
  App.Providers.modelsUrl = modelsUrl;
  App.Providers.chatUrl = chatUrl;
  App.Providers.validate = validate;
  App.Providers.fetchModels = fetchModels;
  App.Providers.parseModels = parseModels;

  /* --------------------------- الاكتشاف التلقائي من المفتاح --------------------------- */
  function detectCandidates(key) {
    key = String(key || '').trim();
    var hits = [];
    var order = App.Providers.PRESETS;
    for (var i = 0; i < order.length; i++) {
      var pre = order[i], pf = pre.keyPrefixes || [];
      for (var j = 0; j < pf.length; j++) {
        if (pf[j] && key.toLowerCase().indexOf(pf[j].toLowerCase()) === 0) {
          hits.push({ presetId: pre.id, prefix: pf[j], score: pf[j].length });
        }
      }
    }
    // استبعاد التعارضات: OpenAI و DeepSeek يشتركان في sk-
    hits.sort(function (a, b) { return b.score - a.score; });
    var seen = {}, out = [];
    for (var k = 0; k < hits.length; k++) {
      if (seen[hits[k].presetId]) continue;
      seen[hits[k].presetId] = 1; out.push(hits[k].presetId);
    }
    if (!out.length && /^sk-/.test(key)) out.push('openai', 'deepseek');
    return out;
  }

  function makeProvider(cfg) {
    var pre = App.Providers.preset(cfg.presetId) || {};
    return {
      id: cfg.id || U.uid('prov'),
      presetId: cfg.presetId || 'custom',
      name: cfg.name || pre.name || 'مزوّد',
      icon: cfg.icon || pre.icon || '🔌',
      type: cfg.type || pre.type || 'openai',
      baseUrl: (cfg.baseUrl || pre.baseUrl || '').replace(/\/+$/, ''),
      apiKey: cfg.apiKey || '',
      customHeader: cfg.customHeader || '',
      modelsPath: cfg.modelsPath || '',
      referer: cfg.referer || '',
      freeOnly: !!cfg.freeOnly,
      models: cfg.models || [],
      status: cfg.status || 'pend',
      statusText: cfg.statusText || '',
      keyHint: cfg.apiKey ? U.mask(cfg.apiKey) : 'بدون مفتاح',
      addedAt: cfg.addedAt || Date.now(),
      lastChecked: cfg.lastChecked || 0
    };
  }

  /* --------------------------- الإضافة: تحقّق ثم جلب ثم حفظ --------------------------- */
  function addProvider(cfg, onStatus) {
    var report = onStatus || function () {};
    var pre = App.Providers.preset(cfg.presetId) || {};
    var p = makeProvider(cfg);

    if (!p.baseUrl) return Promise.resolve({ ok: false, message: 'من فضلك أدخل رابط الـ API (Base URL)' });
    if (!p.apiKey && !pre.noKey && p.presetId !== 'custom')
      return Promise.resolve({ ok: false, message: 'من فضلك أدخل مفتاح API' });

    p.status = 'pend';
    report('التحقق من المفتاح…');

    return validate(p).then(function (v) {
      if (!v.ok) {
        p.status = 'err'; p.statusText = v.message;
        return { ok: false, message: v.message, provider: p };
      }
      p.keyHint = p.apiKey ? U.mask(p.apiKey) : 'بدون مفتاح';
      report('المفتاح يعمل ✅ — جاري جلب النماذج…');
      return fetchModels(p).then(function (models) {
        p.models = models;
        p.status = 'ok';
        p.lastChecked = Date.now();
        p.statusText = models.length + ' نموذج متاح';
        var st = App.Store.state();
        // استبدال نسخة سابقة لنفس الإعداد
        var key = p.presetId + '|' + p.baseUrl + '|' + (p.apiKey || '');
        var idx = -1;
        for (var i = 0; i < st.providers.length; i++) {
          var q = st.providers[i];
          if ((q.presetId + '|' + q.baseUrl + '|' + (q.apiKey || '')) === key) { idx = i; break; }
        }
        if (idx >= 0) { p.id = st.providers[idx].id; st.providers[idx] = p; }
        else st.providers.push(p);
        App.Store.save();
        return { ok: true, provider: p, models: models.length, message: 'تمّت الإضافة بنجاح' };
      });
    }).catch(function (e) {
      p.status = 'err'; p.statusText = e.message || 'خطأ';
      return { ok: false, message: (e.message || 'تعذّر جلب النماذج'), provider: p };
    });
  }

  function refreshProvider(id) {
    var p = App.Providers.get(id);
    if (!p) return Promise.resolve({ ok: false, message: 'المزوّد غير موجود' });
    p.status = 'pend'; p.statusText = 'جاري التحديث…';
    App.Store.save();
    return validate(p).then(function (v) {
      if (!v.ok) { p.status = 'err'; p.statusText = v.message; App.Store.save(); return { ok: false, message: v.message }; }
      return fetchModels(p).then(function (models) {
        p.models = models; p.status = 'ok'; p.lastChecked = Date.now();
        p.statusText = models.length + ' نموذج متاح'; App.Store.save();
        return { ok: true, models: models.length };
      });
    }).catch(function (e) {
      p.status = 'err'; p.statusText = e.message; App.Store.save();
      return { ok: false, message: e.message };
    });
  }

  function removeProvider(id) {
    var st = App.Store.state();
    st.providers = st.providers.filter(function (p) { return p.id !== id; });
    // مسح وكلاء مرتبطين
    st.agents = st.agents.filter(function (a) { return a.providerId !== id; });
    App.Store.save();
  }

  App.Providers.detectCandidates = detectCandidates;
  App.Providers.makeProvider = makeProvider;
  App.Providers.addProvider = addProvider;
  App.Providers.refreshProvider = refreshProvider;
  App.Providers.removeProvider = removeProvider;
  App.Providers.GEMINI_VER = GEMINI_VER;
  App.Providers.ANTHROPIC_VER = ANTHROPIC_VER;
})();
