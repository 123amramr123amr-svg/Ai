/* ==========================================================================
   agent.js — تعريف الوكلاء + حلقة التنفيذ (نموذج ⇆ أدوات) + وضع الفريق
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util;

  var TEMPLATES = [
    { emoji: '◇', name: 'مفكّر', system: 'أنت مفكّر تحليلي دقيق. فكّك المسألة إلى خطوات، واذكر افتراضاتك، ثم أعطِ استنتاجًا واضحًا. اكتب بالعربية.' },
    { emoji: '{}', name: 'مبرمج', system: 'أنت مهندس برمجيات خبير. اكتب كودًا نظيفًا مع شرح موجز، واستخدم كتل الكود. اكتب بالعربية.' },
    { emoji: '~', name: 'كاتب', system: 'أنت كاتب محترف. أسلوبك واضح وجذّاب ومنظّم بعناوين ونقاط. اكتب بالعربية.' },
    { emoji: '?', name: 'باحث', system: 'أنت باحث. اجمع المعلومات، استخدم أداة جلب الروابط عند الحاجة، واذكر المصادر. اكتب بالعربية.' },
    { emoji: 'A/ع', name: 'مترجم', system: 'أنت مترجم محترف. ترجم بدقة ووضّح أي مصطلح غامض.' },
    { emoji: '◆', name: 'مساعد عام', system: 'أنت مساعد ذكي ومباشر. أجب بإيجاز ووضوح. اكتب بالعربية.' }
  ];

  App.Agent = {
    TEMPLATES: TEMPLATES,
    list: function () { return App.Store.state().agents; },
    get: function (id) {
      var a = this.list();
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    },
    create: function (cfg) {
      var st = App.Store.state();
      var a = {
        id: U.uid('agent'),
        name: cfg.name || 'وكيل',
        emoji: cfg.emoji || '◆',
        providerId: cfg.providerId || '',
        model: cfg.model || '',
        system: cfg.system || TEMPLATES[5].system,
        temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7,
        maxTokens: cfg.maxTokens || 0,
        tools: cfg.tools || [],
        createdAt: Date.now()
      };
      st.agents.push(a);
      if (!st.chats[a.id]) st.chats[a.id] = [];
      App.Store.save();
      return a;
    },
    update: function (id, patch) {
      var a = this.get(id);
      if (!a) return null;
      for (var k in patch) a[k] = patch[k];
      App.Store.save();
      return a;
    },
    remove: function (id) {
      var st = App.Store.state();
      st.agents = st.agents.filter(function (x) { return x.id !== id; });
      delete st.chats[id];
      App.Store.save();
    },
    history: function (id) {
      var st = App.Store.state();
      if (!st.chats[id]) st.chats[id] = [];
      return st.chats[id];
    },
    append: function (id, msg) {
      var h = this.history(id);
      msg.ts = Date.now();
      h.push(msg);
      if (h.length > 200) h.splice(0, h.length - 200);
      App.Store.save();
      return msg;
    },
    clear: function (id) {
      App.Store.state().chats[id] = [];
      App.Store.save();
    }
  };

  /* --------------------------- حلقة التنفيذ --------------------------- */
  App.Agent.run = function (agent, cb) {
    cb = cb || {};
    var provider = App.Providers.get(agent.providerId);
    if (!provider) return Promise.reject(new Error('لم يُحدَّد مزوّد صالح لهذا الوكيل'));
    if (!agent.model) return Promise.reject(new Error('لم يُحدَّد نموذج لهذا الوكيل'));

    var toolsOn = (agent.tools || []).length ? App.Tools.schema(agent.tools) : null;
    var st = App.Store.state();
    var stream = st.settings.stream !== false;
    var maxSteps = 6;

    function apiMessages() {
      return App.Agent.history(agent.id)
        .filter(function (m) { return m.role !== 'system'; })
        .map(function (m) {
          if (m.role === 'assistant' && m.calls && m.calls.length) {
            return { role: 'assistant', content: m.content || '', toolCalls: m.calls };
          }
          if (m.role === 'tool') {
            return { role: 'tool', content: m.content, toolCallId: m.toolCallId, name: m.name };
          }
          return { role: m.role, content: m.content };
        });
    }

    function runTools(calls) {
      var chain = Promise.resolve();
      calls.forEach(function (t) {
        chain = chain.then(function () {
          if (cb.onToolStart) cb.onToolStart(t);
          return App.Tools.run(t.name, t.args, { provider: provider, agent: agent }).then(function (out) {
            App.Agent.append(agent.id, { role: 'tool', name: t.name, toolCallId: t.id, toolArgs: t.args, content: out });
            if (cb.onToolEnd) cb.onToolEnd(t, out);
          });
        });
      });
      return chain;
    }

    var step = 0;
    function loop() {
      step++;
      return App.Chat.send({
        provider: provider, model: agent.model,
        messages: apiMessages(), system: agent.system,
        temperature: agent.temperature, maxTokens: agent.maxTokens,
        tools: toolsOn, stream: stream,
        onDelta: cb.onDelta
      }).then(function (res) {
        if (res.toolCalls && res.toolCalls.length && toolsOn && step < maxSteps) {
          App.Agent.append(agent.id, { role: 'assistant', content: res.text || '', calls: res.toolCalls });
          return runTools(res.toolCalls).then(loop);
        }
        App.Agent.append(agent.id, { role: 'assistant', content: res.text || '', usage: res.usage });
        return { text: res.text || '', usage: res.usage, steps: step };
      });
    }
    return loop();
  };

  /* --------------------------- وضع الفريق --------------------------- */
  App.Agent.askTeam = function (agentIds, question, cb) {
    cb = cb || {};
    var chain = Promise.resolve();
    agentIds.forEach(function (id) {
      chain = chain.then(function () {
        var ag = App.Agent.get(id);
        if (!ag) return;
        App.Agent.append(id, { role: 'user', content: question });
        if (cb.onStart) cb.onStart(ag);
        return App.Agent.run(ag, { onDelta: function (t) { if (cb.onDelta) cb.onDelta(ag, t); } })
          .then(function (r) { if (cb.onDone) cb.onDone(ag, r.text); })
          .catch(function (e) { if (cb.onDone) cb.onDone(ag, 'خطأ: ' + e.message); });
      });
    });
    return chain;
  };
})();
