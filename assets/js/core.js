/* ==========================================================================
   core.js — الأساس: أدوات مساعدة، التخزين المحلي، طبقة الشبكة
   (تعمل في المتصفح عبر fetch، وداخل تطبيق أندرويد عبر جسر أصلي يتجاوز CORS)
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  /* --------------------- توافق مع محرّكات WebView القديمة --------------------- */
  (function () {
    if (typeof Element === 'undefined') return;
    if (!Element.prototype.matches) {
      Element.prototype.matches = Element.prototype.webkitMatchesSelector ||
        Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector;
    }
    if (!Element.prototype.closest) {
      Element.prototype.closest = function (sel) {
        var el = this;
        while (el && el.nodeType === 1) {
          if (el.matches && el.matches(sel)) return el;
          el = el.parentElement || el.parentNode;
        }
        return null;
      };
    }
    if (!Object.assign) {
      Object.assign = function (t) {
        for (var i = 1; i < arguments.length; i++) {
          var s = arguments[i];
          for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
        }
        return t;
      };
    }
  })();

  /* --------------------- مراقب الأخطاء (يساعد في التشخيص) --------------------- */
  var errShown = 0;
  window.addEventListener('error', function (e) {
    if (errShown++ > 2) return;
    try {
      var box = document.getElementById('toasts');
      if (!box) return;
      var d = document.createElement('div');
      d.className = 'toast err';
      d.textContent = 'خطأ: ' + (e && e.message ? e.message : 'غير معروف');
      box.appendChild(d);
      setTimeout(function () { d.remove(); }, 7000);
    } catch (x) { }
  });

  /* ------------------------------ أدوات ------------------------------ */
  var Util = App.Util = {
    uid: function (p) {
      return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
    $: function (s, r) { return (r || document).querySelector(s); },
    $$: function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    },
    debounce: function (fn, ms) {
      var t; return function () {
        var a = arguments, self = this;
        clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 300);
      };
    },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    tail: function (s, n) {
      s = String(s || '');
      return s.length <= n ? s : '…' + s.slice(-n);
    },
    mask: function (k) {
      k = String(k || '');
      if (k.length <= 8) return '••••';
      return k.slice(0, 4) + '••••' + k.slice(-4);
    },
    host: function (u) {
      try { return new URL(u).host; } catch (e) { return u; }
    },
    joinUrl: function (base, path) {
      if (!path) return base.replace(/\/+$/, '');
      if (/^https?:\/\//i.test(path)) return path;
      return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    },
    clone: function (o) { return JSON.parse(JSON.stringify(o)); },
    b64enc: function (str) {
      var bytes = new TextEncoder().encode(str), bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    },
    b64dec: function (b64) {
      return new TextDecoder().decode(Util.b64bytes(b64));
    },
    b64bytes: function (b64) {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },
    download: function (name, text) {
      if (window.__nativeSave) {
        try { window.__nativeSave(name, Util.b64enc(text)); return; } catch (e) {}
      }
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return new Promise(function (res, rej) {
        try {
          var t = document.createElement('textarea'); t.value = text;
          t.style.position = 'fixed'; t.style.opacity = '0';
          document.body.appendChild(t); t.select();
          document.execCommand('copy'); t.remove(); res();
        } catch (e) { rej(e); }
      });
    }
  };

  /* ---------------------------- تخزين محلي ---------------------------- */
  var KEY = 'ai_agents_space_v1';
  var Store = App.Store = {
    _s: null,
    defaults: function () {
      return {
        version: 1,
        providers: [],
        agents: [],
        chats: {},
        conversations: {},
        activeConv: {},
        settings: { theme: 'dark', stream: true, confirmDelete: true, appName: 'مساحة الوكلاء' }
      };
    },
    load: function () {
      if (this._s) return this._s;
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) {}
      var s = this.defaults();
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          s = Object.assign(s, parsed);
          s.settings = Object.assign(this.defaults().settings, parsed.settings || {});
        } catch (e) { /* تجاهل التلف ونبدأ من جديد */ }
      }
      this._s = s;
      return s;
    },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this._s)); }
      catch (e) { App.UI && App.UI.toast('تعذّر الحفظ المحلي', 'err'); }
    },
    state: function () { return this.load(); },
    reset: function () { this._s = this.defaults(); this.save(); }
  };

  App.Util = Util;

  /* --------------------------- طبقة الشبكة ---------------------------
     httpRequest(opts) -> Promise<{status, headers, text}>
     httpStream(opts)  -> Promise<{status, headers}> مع استدعاء opts.onChunk
     opts = { method, url, headers, body, timeout, signal }
     إذا وُجد جسر أصلي (تطبيق أندرويد) نستخدمه لتفادي قيود CORS.
  -------------------------------------------------------------------- */
  var pending = {};
  var seq = 0;

  /* ------------------------------ سجل التشخيص ------------------------------ */
  var Log = App.Log = {
    items: [],
    add: function (e) {
      e.ts = Date.now();
      this.items.push(e);
      if (this.items.length > 60) this.items.shift();
    },
    clear: function () { this.items = []; },
    text: function () {
      if (!this.items.length) return 'لا يوجد سجل بعد.';
      return this.items.map(function (e) {
        var t = new Date(e.ts).toLocaleTimeString('ar-EG');
        var head = t + '  ' + e.method + ' ' + e.url.replace(/^https?:\/\//, '');
        if (e.error) return head + '\n   ✗ ' + e.error;
        return head + '\n   ← HTTP ' + e.status + ' · ' + (e.ms || 0) + 'ms' +
          (e.sample ? '\n   ' + e.sample.replace(/\s+/g, ' ').slice(0, 300) : '');
      }).join('\n\n');
    }
  };

  function hasNative() {
    return !!(window.NativeHttp && window.NativeHttp.available);
  }

  if (!window.__nh) {
    window.__nh = {
      headers: function (id, status, headersJson) {
        var p = pending[id]; if (!p) return;
        p.status = status;
        try { p.headers = JSON.parse(headersJson || '{}'); } catch (e) { p.headers = {}; }
        if (p.onHeaders) p.onHeaders(p.status, p.headers);
      },
      chunk: function (id, b64) {
        var p = pending[id]; if (!p) return;
        var bytes;
        try { bytes = Util.b64bytes(b64); } catch (e) { return; }
        if (!p.dec) { try { p.dec = new TextDecoder('utf-8'); } catch (e2) { p.dec = null; } }
        var text;
        if (p.dec) text = p.dec.decode(bytes, { stream: true });
        else { try { text = Util.b64dec(b64); } catch (e3) { return; } }
        if (!text) return;
        p.text += text;
        if (p.onChunk) p.onChunk(text);
      },
      end: function (id, err) {
        var p = pending[id]; if (!p) return;
        delete pending[id];
        clearTimeout(p.timer);
        if (p.dec) {
          var tail = '';
          try { tail = p.dec.decode(); } catch (e4) { }
          if (tail) { p.text += tail; if (p.onChunk) p.onChunk(tail); }
        }
        if (err) p.reject(new Error(err));
        else p.resolve({ status: p.status || 0, headers: p.headers || {}, text: p.text });
      }
    };
  }

  function nativeRequest(o) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq);
      var timer = setTimeout(function () {
        delete pending[id];
        try { window.NativeHttp.abort(id); } catch (e) {}
        reject(new Error('انتهت المهلة'));
      }, o.timeout || 60000);
      pending[id] = {
        resolve: resolve, reject: reject, text: '', dec: null,
        status: 0, headers: {}, timer: timer,
        onChunk: o.onChunk, onHeaders: o.onHeaders
      };
      try {
        window.NativeHttp.start(
          id, (o.method || 'GET').toUpperCase(), o.url,
          JSON.stringify(o.headers || {}),
          o.body ? Util.b64enc(o.body) : ''
        );
      } catch (e) {
        delete pending[id]; clearTimeout(timer); reject(e);
      }
    });
  }

  function fetchRequest(o) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, o.timeout || 60000);
    var init = { method: (o.method || 'GET').toUpperCase(), headers: o.headers || {} };
    if (o.body) init.body = o.body;
    if (ctrl) init.signal = ctrl.signal;
    return fetch(o.url, init).then(function (res) {
      var headers = {};
      res.headers.forEach(function (v, k) { headers[k.toLowerCase()] = v; });
      if (o.onHeaders) o.onHeaders(res.status, headers);
      if (o.onChunk && res.body && res.body.getReader) {
        var reader = res.body.getReader(), dec = new TextDecoder(), all = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) { clearTimeout(timer); return { status: res.status, headers: headers, text: all }; }
            var t = dec.decode(r.value, { stream: true });
            all += t; o.onChunk(t);
            return pump();
          });
        }
        return pump();
      }
      return res.text().then(function (t) {
        clearTimeout(timer);
        if (o.onChunk) o.onChunk(t);
        return { status: res.status, headers: headers, text: t };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('تم الإلغاء');
      throw new Error('فشل الاتصال: ' + (e && e.message ? e.message : e));
    });
  }

  function traced(o, fn) {
    var t0 = Date.now();
    return fn(o).then(function (r) {
      Log.add({
        method: (o.method || 'GET').toUpperCase(), url: o.url, status: r.status,
        ms: Date.now() - t0, sample: String(r.text || '')
      });
      return r;
    }, function (e) {
      Log.add({
        method: (o.method || 'GET').toUpperCase(), url: o.url,
        ms: Date.now() - t0, error: String((e && e.message) || e)
      });
      throw e;
    });
  }

  App.Http = {
    hasNative: hasNative,
    request: function (o) { return traced(o, hasNative() ? nativeRequest : fetchRequest); },
    stream: function (o) { return traced(o, hasNative() ? nativeRequest : fetchRequest); },
    probe: function (url, timeout) {
      return this.request({ url: url, method: 'GET', timeout: timeout || 5000 })
        .then(function (r) { return r.status; })
        .catch(function () { return 0; });
    }
  };
})();
