/* ==========================================================================
   boot.js — ربط الأحداث وتشغيل التطبيق
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util, P = App.Providers, UI = App.UI;

  function report(el) {
    return function (msg) { el.innerHTML = '<span class="spin"></span> ' + U.esc(msg); };
  }

  /* --------------------------- تبويبات --------------------------- */
  function bindTabs() {
    U.$$('.tab').forEach(function (t) {
      t.onclick = function () { UI.tab(t.getAttribute('data-tab')); };
    });
    U.$('#btnSettings').onclick = function () { UI.tab('settings'); };
    U.$('#btnHelp').onclick = UI.help;
    U.$('#btnNewAgent').onclick = function () { UI.agentEditor(null); };
    U.$('#btnChatBack').onclick = function () { UI.tab('agents'); };
    U.$('#btnChatClear').onclick = function () {
      var id = UI.activeAgentId;
      if (!id) return;
      UI.confirm('مسح رسائل المحادثة الحالية؟', 'مسح').then(function (y) {
        if (!y) return;
        App.Agent.clear(id); UI.renderChat();
      });
    };
    U.$('#btnChatList').onclick = UI.chatList;
    U.$('#btnChatNew').onclick = function () {
      if (!UI.activeAgentId) return;
      App.Conv.create(UI.activeAgentId); UI.renderChat(); UI.toast('محادثة جديدة');
    };
    U.$('#btnChatMenu').onclick = function () {
      if (!UI.activeAgentId) return;
      UI.agentEditor(UI.activeAgentId);
    };
  }

  /* --------------------------- طرق إضافة المفتاح --------------------------- */
  function bindAddMethods() {
    U.$$('#addMethod .seg-btn').forEach(function (b) {
      b.onclick = function () {
        U.$$('#addMethod .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var m = b.getAttribute('data-method');
        U.$$('.method').forEach(function (p) { p.style.display = p.getAttribute('data-panel') === m ? '' : 'none'; });
      };
    });

    U.$('#presetSelect').onchange = UI.presetChanged;

    /* 1) مزوّد جاهز */
    U.$('#btnAddPreset').onclick = function () {
      var id = U.$('#presetSelect').value, pre = P.preset(id) || {};
      var key = U.$('#presetKey').value.trim();
      var base = U.$('#presetBase').value.trim() || pre.baseUrl;
      var hintEl = U.$('#presetHint');
      var btn = this; btn.disabled = true;
      P.addProvider({
        presetId: id, apiKey: key, baseUrl: base,
        referer: U.$('#presetReferer').value.trim(),
        freeOnly: U.$('#presetFree').checked
      }, report(hintEl)).then(function (r) {
        btn.disabled = false;
        if (r.ok) {
          hintEl.className = 'hint ok';
          hintEl.innerHTML = '✅ تم إضافة <b>' + U.esc(r.provider.name) + '</b> — ' + r.models + ' نموذج';
          U.$('#presetKey').value = '';
          UI.toast('تمت إضافة المزوّد (' + r.models + ' نموذج)', 'ok');
        } else {
          hintEl.className = 'hint err';
          hintEl.innerHTML = '⚠ ' + U.esc(r.message);
          UI.toast('فشل: ' + r.message, 'err');
        }
        UI.renderProviders();
      });
    };
  }

  /* 3) مزوّد مخصص */
  function customCfg() {
    return {
      presetId: 'custom',
      name: U.$('#custName').value.trim() || 'مزوّد مخصص',
      type: U.$('#custType').value,
      baseUrl: U.$('#custBase').value.trim(),
      apiKey: U.$('#custKey').value.trim(),
      customHeader: U.$('#custHeader').value.trim(),
      modelsPath: U.$('#custModelsPath').value.trim(),
      icon: '🧩'
    };
  }

  function bindCustom() {
    U.$('#btnAddCustom').onclick = function () {
      var el = U.$('#customResult'), btn = this; btn.disabled = true;
      P.addProvider(customCfg(), report(el)).then(function (r) {
        btn.disabled = false;
        el.className = 'hint ' + (r.ok ? 'ok' : 'err');
        el.innerHTML = r.ok ? ('✅ تم — ' + r.models + ' نموذج') : ('⚠ ' + U.esc(r.message));
        UI.toast(r.ok ? 'تمت الإضافة' : ('فشل: ' + r.message), r.ok ? 'ok' : 'err');
        UI.renderProviders();
      });
    };
    U.$('#btnTestCustom').onclick = function () {
      var el = U.$('#customResult'), btn = this; btn.disabled = true;
      var p = P.makeProvider(customCfg());
      el.innerHTML = '<span class="spin"></span> التحقق من المفتاح…';
      P.validate(p).then(function (v) {
        if (!v.ok) { btn.disabled = false; el.className = 'hint err'; el.innerHTML = '⚠ ' + U.esc(v.message); return null; }
        el.innerHTML = '<span class="spin"></span> المفتاح يعمل ✅ — جلب النماذج…';
        return P.fetchModels(p).then(function (m) {
          btn.disabled = false; el.className = 'hint ok';
          el.innerHTML = '✅ يعمل — ' + m.length + ' نموذج. أمثلة: ' + m.slice(0, 5).map(function (x) { return U.esc(x.id); }).join(', ');
        }).catch(function (e) {
          btn.disabled = false; el.className = 'hint warn';
          el.innerHTML = 'المفتاح صالح لكن تعذّر جلب النماذج: ' + U.esc(e.message);
        });
      });
    };
  }

  /* 2) لصق مفتاح + اكتشاف تلقائي */
  function bindAuto() {
    U.$('#btnAutoDetect').onclick = function () {
      var key = U.$('#pasteKey').value.trim(), el = U.$('#detectResult');
      if (!key) { el.className = 'hint err'; el.textContent = 'الصق المفتاح أولًا'; return; }
      var cands = P.detectCandidates(key);
      if (!cands.length) {
        el.className = 'hint warn';
        el.innerHTML = 'لم أتعرّف على المزوّد من شكل المفتاح. استخدم «مزوّد مخصص» وأدخل رابط الـ API.';
        return;
      }
      el.className = 'hint ok';
      el.innerHTML = 'المزوّد المحتمل: ' + cands.map(function (c) {
        var p = P.preset(c); return '<b>' + U.esc(p.name) + '</b>';
      }).join(' أو ') + ' — اضغط «تحقّق وأضف تلقائيًا».';
    };

    U.$('#btnAutoAdd').onclick = function () {
      var key = U.$('#pasteKey').value.trim(), el = U.$('#detectResult'), btn = this;
      if (!key) { el.className = 'hint err'; el.textContent = 'الصق المفتاح أولًا'; return; }
      var cands = P.detectCandidates(key);
      if (!cands.length) { el.className = 'hint warn'; el.innerHTML = 'مفتاح غير معروف الشكل — استخدم «مزوّد مخصص».'; return; }
      btn.disabled = true;
      var i = 0;
      (function tryNext() {
        if (i >= cands.length) {
          btn.disabled = false; el.className = 'hint err';
          el.innerHTML = '⚠ لم أنجح مع أي مزوّد محتمل. جرّب «مزوّد مخصص» لتحديد الرابط يدويًا.';
          return;
        }
        var cid = cands[i++], pre = P.preset(cid);
        el.className = 'hint';
        el.innerHTML = '<span class="spin"></span> تجربة ' + U.esc(pre.name) + '…';
        P.addProvider({ presetId: cid, apiKey: key }).then(function (r) {
          if (r.ok) {
            btn.disabled = false; el.className = 'hint ok';
            el.innerHTML = '✅ تمّت الإضافة عبر <b>' + U.esc(pre.name) + '</b> — ' + r.models + ' نموذج';
            U.$('#pasteKey').value = '';
            UI.toast('تمت الإضافة عبر ' + pre.name, 'ok');
            UI.renderProviders();
          } else { tryNext(); }
        });
      })();
    };
  }

  /* 4) عدة مفاتيح + استيراد */
  function addKeyAuto(key) {
    var cands = P.detectCandidates(key);
    if (!cands.length) return Promise.resolve({ ok: false, message: 'شكل مفتاح غير معروف' });
    var i = 0;
    return new Promise(function (resolve) {
      (function tryNext() {
        if (i >= cands.length) return resolve({ ok: false, message: 'لم ينجح' });
        var cid = cands[i++], pre = P.preset(cid);
        P.addProvider({ presetId: cid, apiKey: key }).then(function (r) {
          if (r.ok) resolve({ ok: true, message: 'تم عبر ' + pre.name + ' (' + r.models + ' نموذج)' });
          else tryNext();
        });
      })();
    });
  }

  function bindBulk() {
    U.$('#btnBulk').onclick = function () {
      var el = U.$('#bulkResult'), btn = this;
      var keys = U.$('#bulkText').value.split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!keys.length) { el.className = 'hint err'; el.textContent = 'أدخل مفتاحًا واحدًا على الأقل'; return; }
      btn.disabled = true;
      el.className = 'hint';
      var done = 0, ok = 0, lines = [];
      var chain = Promise.resolve();
      keys.forEach(function (k, idx) {
        chain = chain.then(function () {
          el.innerHTML = '<span class="spin"></span> ' + (idx + 1) + '/' + keys.length + ' — جاري التحقق…';
          return addKeyAuto(k).then(function (r) {
            if (r.ok) ok++;
            lines.push((r.ok ? '✅ ' : '⚠ ') + U.tail(k, 6) + ': ' + r.message);
          });
        });
      });
      chain.then(function () {
        btn.disabled = false;
        el.className = 'hint ' + (ok ? 'ok' : 'err');
        el.innerHTML = 'تم إضافة ' + ok + ' من ' + keys.length + ' مفتاح<br>' + lines.map(U.esc).join('<br>');
        UI.renderProviders();
      });
    };

    U.$('#btnImport').onclick = function () { U.$('#bulkFile').click(); };

    U.$('#bulkFile').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var txt = String(fr.result || '');
        var el = U.$('#bulkResult');
        var data = null;
        try { data = JSON.parse(txt); } catch (e) {}
        if (data && (data.providers || data.agents)) {
          var st = App.Store.state();
          (data.providers || []).forEach(function (p) { st.providers.push(p); });
          (data.agents || []).forEach(function (a) { st.agents.push(a); });
          if (data.chats) for (var k in data.chats) st.chats[k] = data.chats[k];
          App.Store.save();
          el.className = 'hint ok';
          el.innerHTML = '✅ تم استيراد ' + (data.providers || []).length + ' مزوّد و ' + (data.agents || []).length + ' وكيل';
          UI.renderProviders(); UI.renderAgents();
        } else {
          // نعتبرها قائمة مفاتيح نصية
          U.$('#bulkText').value = txt;
          el.className = 'hint';
          el.textContent = 'تم تحميل المحتوى في الصندوق — اضغط «تحقّق وأضف الكل».';
        }
      };
      fr.readAsText(f);
      this.value = '';
    };
  }

  /* --------------------------- القوائم (تفويض النقر) --------------------------- */
  function bindLists() {
    U.$('#providerList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      UI.providerAction(b.getAttribute('data-act'), b.getAttribute('data-id'));
    });
    U.$('#agentList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'chat') UI.openChat(id);
      if (act === 'convs') { UI.openChat(id); UI.chatList(); }
      if (act === 'edit') UI.agentEditor(id);
      if (act === 'del') {
        var go = function () {
          App.Agent.remove(id);
          if (UI.activeAgentId === id) UI.activeAgentId = null;
          UI.toast('تم حذف الوكيل'); UI.renderAgents();
        };
        if (App.Store.state().settings.confirmDelete !== false)
          UI.confirm('حذف هذا الوكيل وكل محادثاته؟', 'حذف').then(function (y) { if (y) go(); });
        else go();
      }
    });
  }

  /* --------------------------- المحادثة --------------------------- */
  function bindChat() {
    var inp = U.$('#chatInput');
    U.$('#btnSend').onclick = UI.chatSend;
    U.$('#btnStop').onclick = function () { UI.busy = false; UI.finishSend(); };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); UI.chatSend(); }
    });
    inp.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });
  }

  /* --------------------------- الإقلاع --------------------------- */
  function init() {
    App.Store.load();
    App.Conv.migrate();
    UI.applyTheme();
    UI.renderPresetSelect();
    bindTabs();
    bindAddMethods();
    bindCustom();
    bindAuto();
    bindBulk();
    bindLists();
    bindChat();
    UI.bindSettings();

    if (!App.Http.hasNative()) {
      try {
        if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
          navigator.serviceWorker.register('sw.js').catch(function () {});
        }
      } catch (e) {}
    }

    UI.tab('providers');

    var name = App.Store.state().settings.appName;
    if (name) U.$('.brand').textContent = name;

    setTimeout(function () {
      var s = U.$('#splash');
      if (s) { s.classList.add('hide'); setTimeout(function () { s.remove(); }, 600); }
    }, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
