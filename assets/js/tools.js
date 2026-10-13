/* ==========================================================================
   tools.js — أدوات يستطيع الوكيل استخدامها تلقائيًا (function calling)
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util;

  /* --------------------------- الحاسبة الآمنة --------------------------- */
  function safeCalc(expr) {
    expr = String(expr || '').replace(/\^/g, '**').replace(/،/g, ',').replace(/×/g, '*').replace(/÷/g, '/');
    if (!/^[0-9+\-*/%().,\s*eE]+$/.test(expr)) throw new Error('تعبير غير مسموح');
    // تحويل دوال رياضية بسيطة
    var f = new Function('return (' + expr + ')');
    var v = f();
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('نتيجة غير صالحة');
    return v;
  }

  /* --------------------------- الأدوات المتاحة --------------------------- */
  var DEFS = {
    calculator: {
      icon: '🧮', label: 'حاسبة', desc: 'حساب المعادلات الرياضية بدقة',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'التعبير الرياضي، مثال: (12*7)+sqrt… اكتب فقط أرقامًا وعمليات' } },
        required: ['expression']
      },
      run: function (args) {
        return String(safeCalc(args.expression));
      }
    },
    current_time: {
      icon: '🕒', label: 'الوقت والتاريخ', desc: 'معرفة التاريخ والوقت الحالي',
      parameters: { type: 'object', properties: {} },
      run: function () {
        var d = new Date();
        return d.toString() + ' | ISO: ' + d.toISOString();
      }
    },
    fetch_url: {
      icon: '🌐', label: 'جلب صفحة/رابط', desc: 'تنزيل محتوى رابط نصي أو JSON وقراءته',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'الرابط الكامل http/https' },
          max_chars: { type: 'number', description: 'أقصى عدد أحرف تُعاد (افتراضي 6000)' }
        },
        required: ['url']
      },
      run: function (args) {
        var max = args.max_chars || 6000;
        return App.Http.request({ url: args.url, method: 'GET', headers: {}, timeout: 30000 })
          .then(function (r) {
            var t = r.text || '';
            t = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
            t = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return 'HTTP ' + r.status + '\n' + t.slice(0, max);
          });
      }
    },
    http_request: {
      icon: '🔗', label: 'طلب API', desc: 'إرسال طلب HTTP (GET/POST) لأي رابط وإرجاع النتيجة',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'GET أو POST' },
          url: { type: 'string', description: 'الرابط الكامل' },
          body: { type: 'string', description: 'جسم الطلب (نص) — اختياري' },
          content_type: { type: 'string', description: 'نوع المحتوى، افتراضي application/json' }
        },
        required: ['url']
      },
      run: function (args) {
        var headers = {};
        if (args.body) headers['Content-Type'] = args.content_type || 'application/json';
        return App.Http.request({
          url: args.url, method: (args.method || 'GET').toUpperCase(),
          headers: headers, body: args.body || undefined, timeout: 45000
        }).then(function (r) {
          return 'HTTP ' + r.status + '\n' + String(r.text || '').slice(0, 8000);
        });
      }
    },
    list_models: {
      icon: '📋', label: 'قائمة النماذج', desc: 'سرد النماذج المتاحة لمزوّد الوكيل',
      parameters: { type: 'object', properties: {} },
      run: function (args, ctx) {
        var p = ctx && ctx.provider;
        if (!p) return 'لا يوجد مزوّد';
        return p.models.slice(0, 60).map(function (m) { return m.id + (m.free ? ' (مجاني)' : ''); }).join('\n');
      }
    }
  };

  App.Tools = {
    DEFS: DEFS,
    list: function () { return Object.keys(DEFS); },
    schema: function (names) {
      return (names || []).filter(function (n) { return DEFS[n]; }).map(function (n) {
        return { name: n, description: DEFS[n].desc, parameters: DEFS[n].parameters };
      });
    },
    run: function (name, args, ctx) {
      var d = DEFS[name];
      if (!d) return Promise.resolve('أداة غير معروفة: ' + name);
      return new Promise(function (resolve) {
        try {
          Promise.resolve(d.run(args || {}, ctx)).then(function (v) {
            resolve(String(v == null ? '' : v));
          }).catch(function (e) { resolve('خطأ في الأداة: ' + (e.message || e)); });
        } catch (e) { resolve('خطأ في الأداة: ' + (e.message || e)); }
      });
    }
  };
})();
