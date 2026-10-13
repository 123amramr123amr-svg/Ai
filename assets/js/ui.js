/* ==========================================================================
   ui.js — كل واجهة المستخدم: التبويبات، المزوّدون، الوكلاء، المحادثة، الإعدادات
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util, P = App.Providers;

  var UI = App.UI = {};

  /* ------------------------------ تنبيهات ------------------------------ */
  UI.toast = function (msg, kind) {
    var box = U.$('#toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(function () { el.remove(); }, 3600);
  };

  /* ------------------------------ نافذة منبثقة ------------------------------ */
  UI.modal = function (title, html, onMount) {
    var m = U.$('#modal'), box = U.$('#modalBox');
    box.innerHTML = '<div class="modal-head"><h3>' + U.esc(title) + '</h3>' +
      '<button class="icon-btn" id="modalClose">✕</button></div>' + html;
    m.hidden = false;
    U.$('#modalClose').onclick = UI.closeModal;
    m.onclick = function (e) { if (e.target === m) UI.closeModal(); };
    if (onMount) onMount(box);
  };
  UI.closeModal = function () { U.$('#modal').hidden = true; U.$('#modalBox').innerHTML = ''; };

  /* --------- تأكيد وإدخال بديلان (window.confirm/prompt لا يعملان في WebView) --------- */
  UI.confirm = function (msg, okLabel) {
    return new Promise(function (resolve) {
      UI.modal('تأكيد', '<p style="margin:0 0 16px">' + U.esc(msg) + '</p>' +
        '<div class="row"><button class="btn danger" id="cfYes">' + U.esc(okLabel || 'تأكيد') + '</button>' +
        '<button class="btn" id="cfNo">إلغاء</button></div>', function () {
        U.$('#cfYes').onclick = function () { UI.closeModal(); resolve(true); };
        U.$('#cfNo').onclick = function () { UI.closeModal(); resolve(false); };
      });
    });
  };

  UI.prompt = function (msg, value) {
    return new Promise(function (resolve) {
      UI.modal(msg, '<input id="pmVal" value="' + U.esc(value || '') + '">' +
        '<div class="row"><button class="btn primary" id="pmOk">حفظ</button>' +
        '<button class="btn" id="pmNo">إلغاء</button></div>', function () {
        setTimeout(function () { var i = U.$('#pmVal'); if (i) { i.focus(); i.select(); } }, 50);
        U.$('#pmOk').onclick = function () { var v = U.$('#pmVal').value; UI.closeModal(); resolve(v); };
        U.$('#pmNo').onclick = function () { UI.closeModal(); resolve(null); };
      });
    });
  };

  /* ------------------------------ ماركداون مبسّط ------------------------------ */
  UI.md = function (src) {
    var s = U.esc(src || '');
    var blocks = [];
    s = s.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g, function (m, code) {
      blocks.push(code.replace(/\n$/, ''));
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    s = s.replace(/^#{1,6} (.*)$/gm, '<h4>$1</h4>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/^\s*[-*] (.*)$/gm, '• $1');
    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return '<pre>' + blocks[+i] + '</pre>'; });
    return s;
  };

  /* ------------------------------ الثيم والتبويبات ------------------------------ */
  UI.applyTheme = function () {
    var st = App.Store.state();
    document.documentElement.setAttribute('data-theme', st.settings.theme || 'dark');
  };

  UI.scrollBottom = function () {
    try { window.scrollTo(0, document.body.scrollHeight); } catch (e) { }
  };

  UI.tab = function (name) {
    U.$$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    U.$$('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    UI.currentTab = name;
    if (name === 'providers') UI.renderProviders();
    if (name === 'agents') UI.renderAgents();
    if (name === 'chat') UI.renderChat();
    if (name === 'settings') UI.renderSettings();
    if (name === 'integrations') UI.renderIntegrations();
    UI.scrollBottom();
  };

  UI.statusLine = function () {
    var ps = P.list(), ok = 0, models = 0;
    ps.forEach(function (p) { if (p.status === 'ok') ok++; models += (p.models || []).length; });
    var t = ok ? (ok + ' مزوّد مُفعّل · ' + models + ' نموذج') : 'لا يوجد مزوّد مُفعّل';
    var el = U.$('#statusLine'); if (el) el.textContent = t;
  };

  /* ============================== المزوّدون ============================== */
  UI.renderPresetSelect = function () {
    var sel = U.$('#presetSelect');
    if (sel.options.length) return;
    P.PRESETS.forEach(function (pre) {
      var o = document.createElement('option');
      o.value = pre.id; o.textContent = (pre.abbr ? pre.abbr + '  ·  ' : '') + pre.name;
      sel.appendChild(o);
    });
    sel.value = 'openrouter';
    UI.presetChanged();
  };

  UI.presetChanged = function () {
    var id = U.$('#presetSelect').value, pre = P.preset(id) || {};
    var keyUrl = pre.keyUrl ? ' · <a href="' + pre.keyUrl + '" target="_blank" rel="noopener">احصل على مفتاح ↗</a>' : '';
    U.$('#presetHint').innerHTML = U.esc(pre.note || '') + keyUrl;
    U.$('#presetBaseWrap').style.display = pre.custom ? '' : 'none';
    U.$('#presetRefererWrap').style.display = (id === 'openrouter') ? '' : 'none';
    U.$('#presetKey').parentNode.style.display = pre.noKey ? 'none' : '';
    U.$('#presetBase').value = pre.baseUrl || '';
    U.$('#presetKey').value = '';
  };

  UI.renderProviders = function () {
    UI.statusLine();
    var box = U.$('#providerList'), ps = P.list();
    if (!ps.length) {
      box.innerHTML = '<div class="empty">لا يوجد مزوّدون بعد.<br>أضف مفتاحك من الأعلى — من OpenRouter أو مزوّد أصلي أو مزوّد مخصص.</div>';
      return;
    }
    box.innerHTML = '';
    ps.forEach(function (p) {
      var it = document.createElement('div');
      it.className = 'item';
      var dotCls = p.status === 'ok' ? 'ok' : (p.status === 'pend' ? 'pend' : 'err');
      var freeCount = (p.models || []).filter(function (m) { return m.free; }).length;
      var shown = p.freeOnly ? (p.models || []).filter(function (m) { return m.free; }) : (p.models || []);
      it.innerHTML =
        '<div class="ico">' + (p.abbr || p.icon || '··') + '</div>' +
        '<div class="body">' +
        '<div class="title"><span class="dot ' + dotCls + '"></span>' + U.esc(p.name) +
        '<span class="tag prov">' + U.esc(p.type) + '</span>' +
        (p.status === 'ok' ? '<span class="tag">' + shown.length + ' نموذج</span>' : '') +
        (freeCount ? '<span class="tag free">' + freeCount + ' مجاني</span>' : '') + '</div>' +
        '<div class="sub">مفتاح: <span dir="ltr">' + U.esc(p.keyHint || '') + '</span> · <span dir="ltr">' + U.esc(U.host(p.baseUrl)) + '</span></div>' +
        (p.statusText ? '<div class="sub">' + U.esc(p.statusText) + '</div>' : '') +
        '<div class="actions">' +
        '<button class="mini" data-act="models" data-id="' + p.id + '">النماذج</button>' +
        '<button class="mini" data-act="refresh" data-id="' + p.id + '">تحديث</button>' +
        '<button class="mini" data-act="agent" data-id="' + p.id + '">+ وكيل</button>' +
        '<button class="mini danger" data-act="del" data-id="' + p.id + '">حذف</button>' +
        '</div></div>';
      box.appendChild(it);
    });
  };

  UI.showModels = function (id) {
    var p = P.get(id);
    if (!p) return;
    var list = p.models || [];
    if (p.freeOnly) list = list.filter(function (m) { return m.free; });
    var html = '<input id="modelFilter" placeholder="فلترة النماذج…" style="margin-bottom:10px">' +
      '<div class="model-pick" id="modelPick"></div>';
    UI.modal(p.name + ' — ' + list.length + ' نموذج', html, function () {
      function draw(q) {
        q = (q || '').toLowerCase();
        var out = list.filter(function (m) { return !q || m.id.toLowerCase().indexOf(q) >= 0; }).slice(0, 300);
        U.$('#modelPick').innerHTML = out.map(function (m) {
          return '<div class="model-row"><span class="nm">' + U.esc(m.id) + '</span>' +
            (m.free ? '<span class="tag free">مجاني</span>' : '') + '</div>';
        }).join('') || '<div class="empty">لا نتائج</div>';
      }
      draw('');
      U.$('#modelFilter').oninput = function () { draw(this.value); };
    });
  };

  UI.providerAction = function (act, id) {
    if (act === 'models') return UI.showModels(id);
    if (act === 'refresh') {
      UI.toast('جاري التحديث…');
      return P.refreshProvider(id).then(function (r) {
        UI.toast(r.ok ? ('تم التحديث: ' + r.models + ' نموذج') : ('فشل: ' + r.message), r.ok ? 'ok' : 'err');
        UI.renderProviders();
      });
    }
    if (act === 'del') {
      var st = App.Store.state();
      var doIt = function () {
        P.removeProvider(id); UI.toast('تم الحذف'); UI.renderProviders(); UI.renderAgents();
      };
      if (st.settings.confirmDelete) UI.confirm('حذف هذا المزوّد وكل وكلائه؟', 'حذف').then(function (y) { if (y) doIt(); });
      else doIt();
    }
    if (act === 'agent') {
      var p = P.get(id);
      UI.tab('agents');
      UI.agentEditor(null, { providerId: id, model: (p.models[0] || {}).id || '' });
    }
  };

  /* ============================== الوكلاء ============================== */
  UI.renderAgents = function () {
    var box = U.$('#agentList'), list = App.Agent.list();
    if (!list.length) {
      box.innerHTML = '<div class="empty">لا يوجد وكلاء بعد.<br>اضغط «وكيل جديد» لإنشاء أول وكيل.</div>';
      return;
    }
    box.innerHTML = '';
    list.forEach(function (a) {
      var p = P.get(a.providerId);
      var it = document.createElement('div');
      it.className = 'item';
      it.innerHTML =
        '<div class="ico">' + U.esc(a.emoji || '◆') + '</div>' +
        '<div class="body"><div class="title">' + U.esc(a.name) +
        (a.tools && a.tools.length ? '<span class="tag">' + a.tools.length + ' أداة</span>' : '') + '</div>' +
        '<div class="sub">' + U.esc(p ? p.name : 'بدون مزوّد') + ' · ' + U.esc(a.model || 'بدون نموذج') + '</div>' +
        '<div class="actions">' +
        '<button class="mini" data-act="chat" data-id="' + a.id + '">محادثة</button>' +
        '<button class="mini" data-act="convs" data-id="' + a.id + '">' + App.Conv.totalFor(a.id) + ' محادثة</button>' +
        '<button class="mini" data-act="edit" data-id="' + a.id + '">تعديل</button>' +
        '<button class="mini danger" data-act="del" data-id="' + a.id + '">حذف</button>' +
        '</div></div>';
      box.appendChild(it);
    });
  };

  UI.agentEditor = function (agentId, prefill) {
    var editing = agentId ? App.Agent.get(agentId) : null;
    var cfg = editing || prefill || {};
    var providers = P.list();
    if (!providers.length) {
      UI.toast('أضف مزوّدًا ومفتاحًا أولًا', 'err');
      return UI.tab('providers');
    }

    var provOpts = providers.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === cfg.providerId ? ' selected' : '') + '>' +
        U.esc(p.name) + '</option>';
    }).join('');

    var tplOpts = App.Agent.TEMPLATES.map(function (t, i) {
      return '<option value="' + i + '">' + t.emoji + ' ' + U.esc(t.name) + '</option>';
    }).join('');

    var allToolDefs = App.Tools.all();
    var toolChks = App.Tools.list().map(function (n) {
      var d = allToolDefs[n];
      var on = (cfg.tools || []).indexOf(n) >= 0;
      return '<label class="chk"><input type="checkbox" value="' + n + '"' + (on ? ' checked' : '') + '>' +
        '<b>' + U.esc(d.label) + '</b> — <span class="small">' + U.esc(d.desc) + '</span></label>';

    }).join('');

    var html =
      '<div class="grid2">' +
      '<label class="fld"><span>رمز الوكيل</span><input id="aeEmoji" maxlength="4" value="' + U.esc(cfg.emoji || '◆') + '"></label>' +
      '<label class="fld"><span>اسم الوكيل</span><input id="aeName" value="' + U.esc(cfg.name || '') + '" placeholder="مثال: مساعد التسويق"></label>' +
      '</div>' +
      '<label class="fld"><span>من قالب جاهز (اختياري)</span><select id="aeTpl"><option value="">— اختر قالبًا —</option>' + tplOpts + '</select></label>' +
      '<label class="fld"><span>المزوّد</span><select id="aeProvider">' + provOpts + '</select></label>' +
      '<label class="fld"><span>النموذج</span><select id="aeModel"></select></label>' +
      '<label class="fld"><span>وصف الشخصية (System Prompt)</span><textarea id="aeSystem" rows="4">' + U.esc(cfg.system || '') + '</textarea></label>' +
      '<label class="fld"><span>درجة الإبداع (Temperature): <b id="aeTempV">' + (cfg.temperature == null ? 0.7 : cfg.temperature) + '</b></span>' +
      '<input id="aeTemp" type="range" min="0" max="2" step="0.1" value="' + (cfg.temperature == null ? 0.7 : cfg.temperature) + '"></label>' +
      '<label class="fld"><span>حد الرموز (اختياري)</span><input id="aeMax" type="number" min="0" value="' + (cfg.maxTokens || 0) + '"></label>' +
      '<div class="fld"><span>الأدوات المتاحة للوكيل</span>' + toolChks + '</div>' +
      '<div class="row"><button class="btn primary" id="aeSave">حفظ</button>' +
      '<button class="btn" id="aeCancel">إلغاء</button></div>';

    UI.modal(editing ? 'تعديل الوكيل' : 'وكيل جديد', html, function () {
      var pSel = U.$('#aeProvider'), mSel = U.$('#aeModel');
      function fillModels(keep) {
        var p = P.get(pSel.value);
        var list = (p && p.models ? p.models : []).filter(function (m) { return !p.freeOnly || m.free; });
        if (!list.length) {
          mSel.innerHTML = '<option value="">لا نماذج — اضغط تحديث في المزوّد</option>';
          return;
        }
        mSel.innerHTML = list.map(function (m) {
          return '<option value="' + U.esc(m.id) + '"' + (keep && m.id === keep ? ' selected' : '') + '>' +
            U.esc(m.id) + (m.free ? '   (مجاني)' : '') + '</option>';
        }).join('');
      }
      fillModels(cfg.model);
      pSel.onchange = function () { fillModels(); };
      U.$('#aeTpl').onchange = function () {
        var t = App.Agent.TEMPLATES[this.value];
        if (!t) return;
        U.$('#aeSystem').value = t.system;
        if (!U.$('#aeName').value) U.$('#aeName').value = t.name;
        if (!cfg.emoji) U.$('#aeEmoji').value = t.emoji;
      };
      U.$('#aeTemp').oninput = function () { U.$('#aeTempV').textContent = this.value; };
      U.$('#aeCancel').onclick = UI.closeModal;
      U.$('#aeSave').onclick = function () {
        var tools = U.$$('#modalBox .chk input:checked').map(function (c) { return c.value; });
        var patch = {
          emoji: U.$('#aeEmoji').value || '◆',
          name: U.$('#aeName').value.trim() || 'وكيل',
          providerId: pSel.value,
          model: mSel.value,
          system: U.$('#aeSystem').value,
          temperature: parseFloat(U.$('#aeTemp').value),
          maxTokens: parseInt(U.$('#aeMax').value, 10) || 0,
          tools: tools
        };
        var a = editing ? App.Agent.update(agentId, patch) : App.Agent.create(patch);
        UI.closeModal();
        UI.renderAgents();
        UI.toast('تم حفظ الوكيل ✅', 'ok');
        if (!editing) { UI.openChat(a.id); }
      };
    });
  };

  /* ============================== المحادثة ============================== */
  UI.activeAgentId = null;
  UI.busy = false;

  UI.openChat = function (agentId) {
    UI.activeAgentId = agentId;
    UI.tab('chat');
  };

  UI.renderChat = function () {
    var id = UI.activeAgentId;
    if (!id || !App.Agent.get(id)) {
      var list = App.Agent.list();
      if (list.length) { UI.activeAgentId = list[0].id; id = list[0].id; }
      else {
        U.$('#chatName').textContent = 'لا يوجد وكيل';
        U.$('#chatModel').textContent = 'أنشئ وكيلًا من تبويب الوكلاء';
        U.$('#chatAvatar').textContent = 'AI';
        U.$('#chatMessages').innerHTML = '<div class="empty">لا يوجد وكلاء بعد.<br>اذهب إلى تبويب «الوكلاء» وأنشئ وكيلًا.</div>';
        return;
      }
    }
    var a = App.Agent.get(id);
    var p = P.get(a.providerId);
    var conv = App.Conv.active(id);
    U.$('#chatAvatar').textContent = a.emoji || '◆';
    U.$('#chatName').textContent = conv.title || 'محادثة جديدة';
    U.$('#chatModel').textContent = a.name + ' · ' + (p ? p.name : 'بدون مزوّد') + ' · ' + (a.model || '—');
    UI.renderMessages();
  };

  UI.renderMessages = function () {
    var box = U.$('#chatMessages');
    var h = App.Agent.history(UI.activeAgentId);
    if (!h.length) {
      box.innerHTML = '<div class="empty">ابدأ المحادثة.<br><span class="small">الوكيل سيستخدم الأدوات تلقائيًا إن احتاج.</span></div>';
      return;
    }
    box.innerHTML = '';
    h.forEach(function (m) { box.appendChild(UI.msgEl(m)); });
    box.scrollTop = box.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  };

  UI.msgEl = function (m) {
    var d = document.createElement('div');
    if (m.role === 'tool') {
      d.className = 'msg tool';
      d.innerHTML = '<b>TOOL</b> · ' + U.esc(m.name || 'أداة') + '</b>' +
        (m.toolArgs ? '<br><span class="small">' + U.esc(JSON.stringify(m.toolArgs)) + '</span>' : '') +
        '<br><span class="small">' + U.esc(U.tail(m.content || '', 600)) + '</span>';
      return d;
    }
    d.className = 'msg ' + (m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'));
    var body = m.role === 'user' ? U.esc(m.content || '') : UI.md(m.content || '');
    var calls = '';
    if (m.calls && m.calls.length) {
      calls = '<div class="small muted">TOOL · ' + m.calls.map(function (c) { return U.esc(c.name); }).join(', ') + '</div>';
    }
    d.innerHTML = body + calls;
    return d;
  };

    UI.chatList = function () {
      var agentId = UI.activeAgentId;
      if (!agentId) return;
      var html = '<button class="btn primary wide" id="convNew">+ محادثة جديدة</button>' +
        '<div class="list" id="convItems"></div>';
      UI.modal('محادثات الوكيل', html, function () {
        function draw() {
          var arr = App.Conv.list(agentId);
          var cur = App.Conv.active(agentId).id;
          U.$('#convItems').innerHTML = arr.map(function (c) {
            var n = c.messages.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).length;
            var d = new Date(c.updatedAt);
            return '<div class="item"><div class="body">' +
              '<div class="title">' + U.esc(c.title) +
              (c.id === cur ? ' <span class="tag free">الحالية</span>' : '') + '</div>' +
              '<div class="sub">' + n + ' رسالة &middot; ' + d.toLocaleDateString('ar-EG') + '</div>' +
              '<div class="actions">' +
              '<button class="mini" data-cact="open" data-cid="' + c.id + '">فتح</button>' +
              '<button class="mini" data-cact="rename" data-cid="' + c.id + '">إعادة تسمية</button>' +
              '<button class="mini" data-cact="ai" data-cid="' + c.id + '">تسمية بالذكاء</button>' +
              '<button class="mini danger" data-cact="del" data-cid="' + c.id + '">حذف</button>' +
              '</div></div></div>';
          }).join('') || '<div class="empty">لا محادثات بعد</div>';
        }
        draw();
        U.$('#convNew').onclick = function () {
          App.Conv.create(agentId); UI.closeModal(); UI.renderChat();
        };
        U.$('#convItems').addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('[data-cact]') : null;
          if (!b) return;
          var act = b.getAttribute('data-cact'), cid = b.getAttribute('data-cid');
          if (act === 'open') { App.Conv.setActive(agentId, cid); UI.closeModal(); UI.renderChat(); }
          if (act === 'rename') {
            UI.prompt('اسم المحادثة', '').then(function (t) {
              if (t) { App.Conv.rename(agentId, cid, t); draw(); UI.renderChat(); }
            });
          }
          if (act === 'ai') {
            var old = b.textContent; b.textContent = '...';
            App.Conv.aiTitle(agentId, cid).then(function (t) {
              b.textContent = old; draw(); UI.renderChat();
              UI.toast(t ? ('الاسم الجديد: ' + t) : 'تعذّرت التسمية', t ? 'ok' : 'err');
            });
          }
          if (act === 'del') {
            var go = function () { App.Conv.remove(agentId, cid); draw(); UI.renderChat(); };
            if (App.Store.state().settings.confirmDelete !== false)
              UI.confirm('حذف هذه المحادثة؟', 'حذف').then(function (y) { if (y) go(); });
            else go();
          }
        });
      });
    };

  UI.chatSend = function () {
    if (UI.busy) return;
    var inp = U.$('#chatInput');
    var text = inp.value.trim();
    if (!text) return;
    var a = App.Agent.get(UI.activeAgentId);
    if (!a) { UI.toast('اختر وكيلًا أولًا', 'err'); return; }

    var empty = U.$('#chatMessages .empty');
    if (empty) empty.remove();

    App.Agent.append(a.id, { role: 'user', content: text });
    U.$('#chatMessages').appendChild(UI.msgEl({ role: 'user', content: text }));
    inp.value = ''; inp.style.height = 'auto';

    UI.busy = true;
    U.$('#btnSend').disabled = true;
    U.$('#btnStop').hidden = false;

    var bubble = document.createElement('div');
    bubble.className = 'msg assistant typing';
    bubble.textContent = '';
    U.$('#chatMessages').appendChild(bubble);
    var acc = '';

    function scroll() { window.scrollTo(0, document.body.scrollHeight); }

    App.Agent.run(a, {
      onDelta: function (t) { if (!UI.busy) return; acc += t; bubble.innerHTML = UI.md(acc); scroll(); },
      onToolStart: function (t) {
        var tb = document.createElement('div');
        tb.className = 'msg tool';
        tb.innerHTML = '<b>TOOL</b> · ' + U.esc(t.name) + '</b>… <span class="spin"></span>';
        U.$('#chatMessages').insertBefore(tb, bubble);
        scroll();
      },
      onToolEnd: function (t, out) {
        var els = U.$$('#chatMessages .msg.tool');
        var last = els[els.length - 1];
        if (last) last.innerHTML = '<b>TOOL</b> · ' + U.esc(t.name) + '</b><br><span class="small">' + U.esc(U.tail(out, 400)) + '</span>';
      }
    }).then(function () {
      UI.finishSend();
    }).catch(function (e) {
      bubble.classList.remove('typing');
      bubble.className = 'msg system';
      bubble.textContent = '⚠ ' + (e.message || 'حدث خطأ');
      UI.finishSend();
    });
  };

  UI.finishSend = function () {
    UI.busy = false;
    U.$('#btnSend').disabled = false;
    U.$('#btnStop').hidden = true;
    UI.renderMessages();
  };

  UI.renderIntegrations = function () {
    var box = U.$('#integrationsBox');
    if (!box) return;
    var IG = App.Integrations;
    var g = IG.cfg('github'), t = IG.cfg('telegram'), w = IG.cfg('webhook');

    var ghCard =
      '<div class="card">' +
      '<h3 class="sect-title">01 — GitHub</h3>' +
      '<p class="muted small">اربط حسابك ليقدر الوكيل ينشئ مستودعات ويكتب الملفات ويفتح مهام — يعني يبني مشاريع كاملة.</p>' +
      '<label class="fld"><span>التوكن (Personal Access Token)</span>' +
      '<input class="ltr" id="ghToken" type="password" placeholder="ghp_..." value="' + U.esc(g.token) + '"></label>' +
      '<div class="grid2">' +
      '<label class="fld"><span>الحساب / المؤسسة</span><input class="ltr" id="ghOwner" value="' + U.esc(g.owner) + '"></label>' +
      '<label class="fld"><span>المستودع الافتراضي</span><input class="ltr" id="ghRepo" value="' + U.esc(g.defaultRepo) + '"></label>' +
      '</div>' +
      '<div class="row"><button class="btn primary" id="ghSave">تحقّق وحفظ</button>' +
      '<button class="btn danger" id="ghOff">فصل</button></div>' +
      '<div id="ghStatus" class="hint ' + (g.enabled ? 'ok' : '') + '">' +
      (g.enabled ? ('مربوط بحساب ' + U.esc(g.user || g.owner)) : 'غير مربوط') + '</div>' +
      '<p class="muted small">أنشئ توكن من <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a> — يكفي صلاحية <b>repo</b>.</p>' +
      '</div>';

    var agentOpts = '<option value="">— اختر وكيلًا —</option>' + App.Agent.list().map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === t.agentId ? ' selected' : '') + '>' +
        U.esc(a.name) + '</option>';
    }).join('');

    var tgCard =
      '<div class="card">' +
      '<h3 class="sect-title">02 — تليجرام</h3>' +
      '<p class="muted small">أنشئ بوت من <b>@BotFather</b> والصق التوكن، واختر الوكيل الذي سيرد على رسائلك.</p>' +
      '<label class="fld"><span>توكن البوت</span>' +
      '<input class="ltr" id="tgToken" type="password" placeholder="123456:ABC-DEF..." value="' + U.esc(t.token) + '"></label>' +
      '<div class="row"><button class="btn" id="tgVerify">تحقّق من البوت</button>' +
      '<span class="hint" id="tgBot">' + (t.botName ? ('@' + U.esc(t.botName)) : '') + '</span></div>' +
      '<label class="fld"><span>الوكيل الذي يرد</span><select id="tgAgent">' + agentOpts + '</select></label>' +
      '<div class="row"><button class="btn primary" id="tgStart">تشغيل الاستقبال</button>' +
      '<button class="btn danger" id="tgStop">إيقاف</button></div>' +
      '<div id="tgStatus" class="hint ' + (t.enabled ? 'ok' : '') + '">' +
      (t.enabled ? 'يعمل الآن — أرسل رسالة للبوت' : 'متوقف') + '</div>' +
      '<p class="muted small">الاستقبال يعمل طالما التطبيق نشط.</p>' +
      '<div class="model-pick" style="margin-top:10px">' +
      (IG.tgLog().slice().reverse().map(function (l) {
        var d = new Date(l.ts).toLocaleTimeString('ar-EG');
        var mark = l.dir === 'in' ? '< ' : (l.dir === 'out' ? '> ' : (l.dir === 'err' ? '! ' : '. '));
        return '<div class="model-row"><span class="num">' + d + '</span><span class="nm">' +
          U.esc(mark + l.text) + '</span></div>';
      }).join('') || '<div class="model-row"><span class="nm">لا رسائل بعد</span></div>') +
      '</div></div>';

    var whCard =
      '<div class="card">' +
      '<h3 class="sect-title">03 — Webhook</h3>' +
      '<p class="muted small">اربط Slack أو Discord أو أي خدمة: الوكيل يقدر يبعت تقاريره هناك.</p>' +
      '<label class="fld"><span>رابط الـ Webhook</span>' +
      '<input class="ltr" id="whUrl" placeholder="https://hooks.slack.com/..." value="' + U.esc(w.url) + '"></label>' +
      '<div class="row"><button class="btn primary" id="whSave">حفظ</button>' +
      '<button class="btn" id="whTest">إرسال تجربة</button></div>' +
      '<div id="whStatus" class="hint ' + (w.enabled ? 'ok' : '') + '">' +
      (w.enabled ? 'مفعّل' : 'غير مفعّل') + '</div></div>';

    var activeTools = App.Tools.list();
    var toolsCard =
      '<div class="card"><h3 class="sect-title">04 — الأدوات المتاحة للوكلاء</h3>' +
      '<div class="chips">' + (activeTools.length ? activeTools.map(function (n) {
        return '<span class="tag">' + U.esc(n) + '</span>';
      }).join('') : '<span class="muted small">لا أدوات</span>') + '</div>' +
      '<p class="muted small">فعّل الأدوات لكل وكيل من تبويب «الوكلاء» ← تعديل.</p></div>';

    box.innerHTML = ghCard + tgCard + whCard + toolsCard;
    UI.bindIntegrations();
  };

  UI.bindIntegrations = function () {
    var IG = App.Integrations;
    var $ = function (s) { return U.$(s); };

    $('#ghSave').onclick = function () {
      var btn = this; btn.disabled = true;
      var s = $('#ghStatus'); s.className = 'hint'; s.innerHTML = '<span class="spin"></span> جاري التحقق…';
      IG.cfg('github').defaultRepo = $('#ghRepo').value.trim();
      IG.verifyGithub($('#ghToken').value, $('#ghOwner').value).then(function (user) {
        btn.disabled = false;
        s.className = 'hint ok';
        s.innerHTML = 'مربوط بحساب <b>' + U.esc(user) + '</b>';
        UI.toast('تم ربط GitHub', 'ok'); UI.renderIntegrations();
      }).catch(function (e) {
        btn.disabled = false; s.className = 'hint err';
        s.innerHTML = 'فشل: ' + U.esc(e.message || e);
      });
    };

    $('#ghOff').onclick = function () {
      UI.confirm('فصل حساب GitHub؟', 'فصل').then(function (y) {
        if (!y) return;
        IG.disconnectGithub(); UI.renderIntegrations(); UI.toast('تم الفصل');
      });
    };

    $('#tgVerify').onclick = function () {
      var btn = this; btn.disabled = true;
      IG.tgVerify($('#tgToken').value).then(function (name) {
        btn.disabled = false; $('#tgBot').textContent = '@' + name;
        UI.toast('البوت: @' + name, 'ok'); UI.renderIntegrations();
      }).catch(function (e) {
        btn.disabled = false; UI.toast('فشل: ' + (e.message || e), 'err');
      });
    };

    $('#tgAgent').onchange = function () { IG.cfg('telegram').agentId = this.value; IG.save(); };

    $('#tgStart').onclick = function () {
      var btn = this; btn.disabled = true;
      var c = IG.cfg('telegram');
      c.token = $('#tgToken').value.trim();
      c.agentId = $('#tgAgent').value;
      IG.save();
      IG.tgStart().then(function () {
        btn.disabled = false; UI.toast('تم تشغيل استقبال تليجرام', 'ok'); UI.renderIntegrations();
      }).catch(function (e) {
        btn.disabled = false; UI.toast('فشل: ' + (e.message || e), 'err');
      });
    };

    $('#tgStop').onclick = function () {
      IG.tgStop().then(function () { UI.toast('تم الإيقاف'); UI.renderIntegrations(); });
    };

    $('#whSave').onclick = function () {
      var c = IG.cfg('webhook');
      c.url = $('#whUrl').value.trim();
      c.enabled = !!c.url;
      IG.save(); UI.toast(c.enabled ? 'تم الحفظ' : 'تم إلغاء التفعيل', 'ok');
      UI.renderIntegrations();
    };

    $('#whTest').onclick = function () {
      var btn = this; btn.disabled = true;
      var s = $('#whStatus'); s.className = 'hint'; s.innerHTML = '<span class="spin"></span> جاري الإرسال…';
      IG.postWebhook('رسالة تجربة من مساحة الوكلاء', $('#whUrl').value.trim())
        .then(function (m) { btn.disabled = false; s.className = 'hint ok'; s.textContent = m; })
        .catch(function (e) { btn.disabled = false; s.className = 'hint err'; s.textContent = 'فشل: ' + (e.message || e); });
    };
  };

  /* ============================== الإعدادات ============================== */
  UI.renderSettings = function () {
    var s = App.Store.state().settings;
    U.$('#setAppName').value = s.appName || '';
    U.$('#setTheme').value = s.theme || 'dark';
    U.$('#setStream').checked = s.stream !== false;
    U.$('#setConfirmDelete').checked = s.confirmDelete !== false;
    var items = App.Log.items.length;
    var lastErr = null;
    for (var i = App.Log.items.length - 1; i >= 0; i--) {
      if (App.Log.items[i].error) { lastErr = App.Log.items[i]; break; }
    }
    U.$('#diagSummary').textContent = items
      ? (items + ' عملية اتصال مسجّلة' + (lastErr ? ' · آخر خطأ: ' + String(lastErr.error).slice(0, 70) : ' · لا أخطاء'))
      : 'لا يوجد سجل اتصالات بعد.';
    U.$('#aboutText').innerHTML =
      'التطبيق يعمل بالكامل من جهازك، بدون سيرفر وسيط. مفاتيحك تُحفظ محليًا فقط.<br>' +
      'الإصدار 1.0 · ' + (App.Http.hasNative() ? 'محرّك الشبكة: أصلي (بدون قيود CORS)' : 'محرّك الشبكة: المتصفح (fetch)');
  };

  UI.bindSettings = function () {
    U.$('#setTheme').onchange = function () {
      App.Store.state().settings.theme = this.value; App.Store.save(); UI.applyTheme();
    };
    U.$('#setStream').onchange = function () {
      App.Store.state().settings.stream = this.checked; App.Store.save();
    };
    U.$('#setConfirmDelete').onchange = function () {
      App.Store.state().settings.confirmDelete = this.checked; App.Store.save();
    };
    U.$('#setAppName').oninput = U.debounce(function () {
      App.Store.state().settings.appName = this.value; App.Store.save();
      U.$('.brand').textContent = this.value || 'مساحة الوكلاء';
    }, 400);
    U.$('#btnExport').onclick = function () {
      U.download('ai-agents-backup.json', JSON.stringify(App.Store.state(), null, 2));
      UI.toast('تم تصدير الملف (يحتوي مفاتيحك — احفظه في مكان آمن)', 'ok');
    };
    U.$('#btnImportData').onclick = function () { U.$('#bulkFile').click(); UI.tab('providers'); };
    U.$('#btnDiag').onclick = function () {
      UI.modal('سجل الاتصالات',
        '<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:10.5px;line-height:1.9;' +
        'max-height:60vh;overflow:auto;direction:ltr;text-align:left">' +
        U.esc(App.Log.text()) + '</pre>');
    };
    U.$('#btnDiagClear').onclick = function () {
      App.Log.clear(); UI.renderSettings(); UI.toast('تم مسح السجل');
    };
    U.$('#btnTestModel').onclick = UI.testModel;
    U.$('#btnWipe').onclick = function () {
      UI.confirm('سيتم حذف كل المزوّدين والوكلاء والمحادثات نهائيًا.', 'حذف الكل').then(function (y) {
        if (!y) return;
        App.Store.reset(); UI.activeAgentId = null;
        UI.applyTheme(); UI.tab('providers'); UI.renderAgents();
        UI.toast('تم حذف كل البيانات');
      });
    };
  };

  UI.testModel = function () {
    var el = U.$('#diagResult');
    var ag = App.Agent.list()[0];
    var provider = null, model = '';
    if (ag) { provider = P.get(ag.providerId); model = ag.model; }
    if (!provider) {
      provider = P.list()[0];
      model = provider && provider.models[0] ? provider.models[0].id : '';
    }
    if (!provider) { el.className = 'hint err'; el.textContent = 'أضف مزوّدًا ومفتاحًا أولًا.'; return; }
    if (!model) { el.className = 'hint err'; el.textContent = 'لا يوجد نموذج مختار — اضغط «تحديث» على المزوّد.'; return; }
    el.className = 'hint';
    el.innerHTML = '<span class="spin"></span> جاري إرسال رسالة قصيرة إلى النموذج…';
    App.Chat.send({
      provider: provider, model: model, stream: false, temperature: 0,
      messages: [{ role: 'user', content: 'قل كلمة واحدة: تم' }]
    }).then(function (r) {
      el.className = 'hint ok';
      el.innerHTML = '✅ النموذج يرد فعلًا.<br>' + U.esc(model) + '<br>الرد: ' +
        U.esc(String(r.text || '(رد فارغ)').slice(0, 250));
      UI.renderSettings();
    }).catch(function (e) {
      el.className = 'hint err';
      el.innerHTML = '⚠ فشل: ' + U.esc(e.message || e) + '<br>' + U.esc(model) +
        '<br>راجع «سجل الاتصالات» لمعرفة التفاصيل.';
      UI.renderSettings();
    });
  };

  /* ------------------------------ مساعدة ------------------------------ */
  UI.help = function () {
    UI.modal('كيف تستخدم التطبيق؟',
      '<ol>' +
      '<li><b>أضف مفتاحًا:</b> من تبويب «المزوّدون» اختر طريقة — مزوّد جاهز (OpenRouter / OpenAI / DeepSeek / Google AI Studio…)، أو الصق مفتاحًا ليكتشفه تلقائيًا، أو مزوّد مخصص برابط + مفتاح.</li>' +
      '<li><b>التحقق:</b> قبل حفظ أي مفتاح يتحقق التطبيق من صحته، ثم يجلب قائمة النماذج المتاحة.</li>' +
      '<li><b>أنشئ وكيلًا:</b> من تبويب «الوكلاء» اختر النموذج واكتب شخصيته وحدّد أدواته (حاسبة، وقت، جلب روابط، طلبات API).</li>' +
      '<li><b>تحدّث:</b> من تبويب «المحادثة» أرسل رسالتك — الوكيل يستخدم الأدوات تلقائيًا عند الحاجة.</li>' +
      '</ol>' +
      '<p class="muted small">نصيحة: مفاتيح OpenRouter تعطيك وصولًا لمئات النماذج، وفيها قسم كامل للنماذج المجانية — اختر «نماذج مجانية فقط».</p>');
  };
})();


