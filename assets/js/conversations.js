/* ==========================================================================
   conversations.js — مكتبة المحادثات: عدة محادثات لكل وكيل باسم تلقائي
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util;

  function st() { return App.Store.state(); }
  function ensure() {
    if (!st().conversations) st().conversations = {};
    if (!st().activeConv) st().activeConv = {};
  }

  function list(agentId) {
    ensure();
    var s = st();
    if (!s.conversations[agentId]) s.conversations[agentId] = [];
    return s.conversations[agentId];
  }

  function create(agentId, title, silent) {
    var c = {
      id: U.uid('conv'),
      title: title || 'محادثة جديدة',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    list(agentId).unshift(c);
    ensure();
    st().activeConv[agentId] = c.id;
    if (!silent) App.Store.save();
    return c;
  }

  function active(agentId, createIfNone) {
    ensure();
    var s = st(), arr = list(agentId), id = s.activeConv[agentId];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    if (arr.length) { s.activeConv[agentId] = arr[0].id; return arr[0]; }
    if (createIfNone === false) return null;
    return create(agentId);
  }

  function setActive(agentId, convId) {
    ensure();
    st().activeConv[agentId] = convId;
    App.Store.save();
  }

  function remove(agentId, convId) {
    var arr = list(agentId);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === convId) { arr.splice(i, 1); break; }
    }
    ensure();
    if (st().activeConv[agentId] === convId) {
      st().activeConv[agentId] = arr.length ? arr[0].id : null;
      if (!arr.length) create(agentId);
    }
    App.Store.save();
  }

  function rename(agentId, convId, title) {
    var arr = list(agentId);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === convId) { arr[i].title = title || 'محادثة'; break; }
    }
    App.Store.save();
  }

  function touch(agentId, convId) {
    var arr = list(agentId);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === convId) { arr[i].updatedAt = Date.now(); break; }
    }
  }

  /** اسم تلقائي من أول رسالة */
  function titleFrom(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[\s\-*#>؟?]+/, '');
    if (!t) return 'محادثة جديدة';
    var words = t.split(' ');
    var out = words.slice(0, 7).join(' ');
    if (out.length > 44) out = out.slice(0, 44) + '…';
    else if (words.length > 7) out += '…';
    return out;
  }

  /** يُسمّي المحادثة تلقائيًا إذا كانت ما زالت باسمها الافتراضي */
  function autoTitle(agentId, convId, text) {
    var arr = list(agentId);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === convId) {
        if (!arr[i].title || arr[i].title === 'محادثة جديدة') {
          arr[i].title = titleFrom(text);
          App.Store.save();
        }
        return arr[i].title;
      }
    }
    return '';
  }

  /** تسمية بمساعدة النموذج نفسها */
  function aiTitle(agentId, convId) {
    var ag = App.Agent.get(agentId);
    var provider = ag && App.Providers.get(ag.providerId);
    if (!ag || !provider || !ag.model) return Promise.resolve('');
    var msgs = [], arr = list(agentId);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === convId) { msgs = arr[i].messages; break; }
    var firstUser = '';
    for (var j = 0; j < msgs.length; j++) if (msgs[j].role === 'user') { firstUser = msgs[j].content; break; }
    if (!firstUser) return Promise.resolve('');
    return App.Chat.send({
      provider: provider, model: ag.model, stream: false, temperature: 0.2,
      messages: [{
        role: 'user',
        content: 'اكتب عنوانًا قصيرًا جدًا (٣ إلى ٥ كلمات، بدون علامات ترقيم وبدون مقدمات) لهذه المحادثة:\n"' + firstUser + '"'
      }]
    }).then(function (r) {
      var t = String(r.text || '').replace(/[\n"«»]/g, ' ').replace(/\s+/g, ' ').trim();
      t = t.replace(/^العنوان\s*[:：]\s*/, '');
      if (t.length > 48) t = t.slice(0, 48);
      if (t) rename(agentId, convId, t);
      return t;
    }).catch(function () { return ''; });
  }

  /** ترحيل البيانات القديمة (مصفوفة رسائل لكل وكيل) إلى محادثات */
  function migrate() {
    var s = App.Store.state();
    ensure();
    var old = s.chats || {};
    var moved = false;
    for (var agentId in old) {
      if (!Object.prototype.hasOwnProperty.call(old, agentId)) continue;
      var msgs = old[agentId];
      if (!Array.isArray(msgs) || !msgs.length) continue;
      if (s.conversations[agentId] && s.conversations[agentId].length) continue;
      var firstUser = '';
      for (var i = 0; i < msgs.length; i++) if (msgs[i].role === 'user') { firstUser = msgs[i].content; break; }
      var c = {
        id: U.uid('conv'),
        title: titleFrom(firstUser),
        createdAt: (msgs[0] && msgs[0].ts) || Date.now(),
        updatedAt: (msgs[msgs.length - 1] && msgs[msgs.length - 1].ts) || Date.now(),
        messages: msgs
      };
      s.conversations[agentId] = [c];
      s.activeConv[agentId] = c.id;
      moved = true;
    }
    if (moved) App.Store.save();
  }

  function totalFor(agentId) { return list(agentId).length; }

  function removeAllFor(agentId) {
    ensure();
    delete st().conversations[agentId];
    delete st().activeConv[agentId];
    App.Store.save();
  }

  App.Conv = {
    list: list, create: create, active: active, setActive: setActive,
    remove: remove, rename: rename, touch: touch,
    titleFrom: titleFrom, autoTitle: autoTitle, aiTitle: aiTitle,
    migrate: migrate, totalFor: totalFor, removeAllFor: removeAllFor
  };
})();
