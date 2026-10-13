/* ==========================================================================
   chat.js — تكييف المحادثة لكل مزوّد (OpenAI-compatible / Gemini / Anthropic)
   مع دعم البث المباشر (streaming) والاستدعاء الآلي للأدوات (tools).
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, U = App.Util, P = App.Providers;

  /* ------------------------------ محلّل SSE ------------------------------ */
  function sseParser(onEvent) {
    var buf = '';
    return function (chunk) {
      buf += chunk;
      var idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        var line = buf.slice(0, idx); buf = buf.slice(idx + 1);
        line = line.replace(/\r$/, '');
        if (!line || line.charAt(0) === ':') continue;
        if (line.indexOf('data:') === 0) {
          var data = line.slice(5).trim();
          if (data === '[DONE]') { onEvent({ done: true }); continue; }
          try { onEvent({ data: JSON.parse(data) }); } catch (e) { /* تجاهل */ }
        } else {
          // بعض السيرفرات ترسل JSON خام بدون data:
          var t = line.trim();
          if (t.charAt(0) === '{') { try { onEvent({ data: JSON.parse(t) }); } catch (e2) {} }
        }
      }
    };
  }

  function safeJson(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

  /* ------------------------------ تحويل الرسائل ------------------------------ */
  function toOpenAIMessages(messages, system) {
    var out = [];
    if (system) out.push({ role: 'system', content: system });
    messages.forEach(function (m) {
      if (m.role === 'system') { out.push({ role: 'system', content: m.content }); return; }
      if (m.role === 'tool') {
        out.push({ role: 'tool', tool_call_id: m.toolCallId || 'call_0', content: String(m.content || '') });
        return;
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
        out.push({
          role: 'assistant', content: m.content || null,
          tool_calls: m.toolCalls.map(function (t) {
            return { id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args || {}) } };
          })
        });
        return;
      }
      out.push({ role: m.role, content: m.content == null ? '' : String(m.content) });
    });
    return out;
  }

  function toAnthropic(messages, system) {
    var out = [];
    messages.forEach(function (m) {
      if (m.role === 'system') return;
      if (m.role === 'tool') {
        out.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content || '') }]
        });
        return;
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
        var blocks = [];
        if (m.content) blocks.push({ type: 'text', text: String(m.content) });
        m.toolCalls.forEach(function (t) {
          blocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args || {} });
        });
        out.push({ role: 'assistant', content: blocks });
        return;
      }
      out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
    });
    return out;
  }

  function toGemini(messages) {
    var out = [];
    messages.forEach(function (m) {
      if (m.role === 'system') return;
      if (m.role === 'tool') {
        out.push({
          role: 'user',
          parts: [{ functionResponse: { name: m.name || 'tool', response: { result: String(m.content || '') } } }]
        });
        return;
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
        var parts = [];
        if (m.content) parts.push({ text: String(m.content) });
        m.toolCalls.forEach(function (t) { parts.push({ functionCall: { name: t.name, args: t.args || {} } }); });
        out.push({ role: 'model', parts: parts });
        return;
      }
      out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] });
    });
    return out;
  }

  function openaiTools(tools) {
    if (!tools || !tools.length) return undefined;
    return tools.map(function (t) {
      return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
    });
  }
  function anthropicTools(tools) {
    if (!tools || !tools.length) return undefined;
    return tools.map(function (t) { return { name: t.name, description: t.description, input_schema: t.parameters }; });
  }
  function geminiTools(tools) {
    if (!tools || !tools.length) return undefined;
    return [{ functionDeclarations: tools.map(function (t) {
      return { name: t.name, description: t.description, parameters: t.parameters };
    }) }];
  }

  App.Chat = App.Chat || {};
  App.Chat._util = { sseParser: sseParser, safeJson: safeJson, toOpenAIMessages: toOpenAIMessages,
    toAnthropic: toAnthropic, toGemini: toGemini, openaiTools: openaiTools,
    anthropicTools: anthropicTools, geminiTools: geminiTools };

  function errFrom(status, json, text) {
    var m = '';
    if (json) {
      if (json.error && json.error.message) m = json.error.message;
      else if (typeof json.error === 'string') m = json.error;
      else if (json.message) m = json.message;
    }
    if (!m) m = text ? String(text).slice(0, 300) : ('رمز الاستجابة ' + status);
    var e = new Error(m); e.status = status; return e;
  }

  /* --------------------------- 1) OpenAI-compatible --------------------------- */
  function sendOpenAI(o) {
    var p = o.provider;
    var body = {
      model: o.model,
      messages: toOpenAIMessages(o.messages, o.system),
      stream: !!o.stream
    };
    if (typeof o.temperature === 'number') body.temperature = o.temperature;
    if (o.maxTokens) body.max_tokens = o.maxTokens;
    var tools = openaiTools(o.tools);
    if (tools) { body.tools = tools; body.tool_choice = 'auto'; }

    var headers = P.headersFor(p, true);
    var url = U.joinUrl(p.baseUrl, '/chat/completions');
    var res = { text: '', toolCalls: [], finish: null, usage: null, error: null };

    if (!o.stream) {
      return App.Http.request({ url: url, method: 'POST', headers: headers, body: JSON.stringify(body), timeout: o.timeout || 180000 })
        .then(function (r) {
          var j = safeJson(r.text, null);
          if (r.status < 200 || r.status >= 300) throw errFrom(r.status, j, r.text);
          var msg = (j && j.choices && j.choices[0] && j.choices[0].message) || {};
          res.text = msg.content || '';
          if (Array.isArray(msg.content)) res.text = msg.content.map(function (c) { return c.text || ''; }).join('');
          if (msg.tool_calls) {
            res.toolCalls = msg.tool_calls.map(function (t) {
              return { id: t.id || U.uid('call'), name: t.function && t.function.name, args: safeJson(t.function && t.function.arguments, {}) };
            });
          }
          res.usage = j && j.usage;
          if (o.onDelta && res.text) o.onDelta(res.text);
          return res;
        });
    }

    var partial = {};
    var parser = sseParser(function (ev) {
      if (ev.done) return;
      var d = ev.data; if (!d) return;
      if (d.error) { res.error = d.error.message || String(d.error); return; }
      var ch = d.choices && d.choices[0]; if (!ch) return;
      var delta = ch.delta || {};
      if (delta.content) {
        var txt = typeof delta.content === 'string' ? delta.content
          : (Array.isArray(delta.content) ? delta.content.map(function (c) { return c.text || ''; }).join('') : '');
        res.text += txt; if (o.onDelta && txt) o.onDelta(txt);
      }
      if (delta.tool_calls) {
        delta.tool_calls.forEach(function (tc) {
          var i = tc.index || 0;
          partial[i] = partial[i] || { id: '', name: '', args: '' };
          if (tc.id) partial[i].id = tc.id;
          if (tc.function) {
            if (tc.function.name) partial[i].name = tc.function.name;
            if (tc.function.arguments) partial[i].args += tc.function.arguments;
          }
        });
      }
      if (ch.finish_reason) res.finish = ch.finish_reason;
      if (d.usage) res.usage = d.usage;
    });

    return App.Http.request({
      url: url, method: 'POST', headers: headers, body: JSON.stringify(body),
      timeout: o.timeout || 180000, onChunk: parser
    }).then(function (r) {
      if (r.status < 200 || r.status >= 300) throw errFrom(r.status, safeJson(r.text, null), r.text);
      if (res.error) throw new Error(res.error);
      Object.keys(partial).forEach(function (k) {
        var t = partial[k];
        if (t.name) res.toolCalls.push({ id: t.id || U.uid('call'), name: t.name, args: safeJson(t.args, {}) });
      });
      return res;
    });
  }

  App.Chat.sendOpenAI = sendOpenAI;
  App.Chat._errFrom = errFrom;

  /* --------------------------- 2) Google Gemini --------------------------- */
  function sendGemini(o) {
    var p = o.provider;
    var action = o.stream ? 'streamGenerateContent' : 'generateContent';
    var url = U.joinUrl(p.baseUrl, '/models/' + encodeURIComponent(o.model) + ':' + action);
    if (o.stream) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'alt=sse';
    if (p.apiKey) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(p.apiKey);

    var body = { contents: toGemini(o.messages) };
    if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
    var gc = {};
    if (typeof o.temperature === 'number') gc.temperature = o.temperature;
    if (o.maxTokens) gc.maxOutputTokens = o.maxTokens;
    if (Object.keys(gc).length) body.generationConfig = gc;
    var tools = geminiTools(o.tools);
    if (tools) body.tools = tools;

    var headers = P.headersFor(p, true);
    var res = { text: '', toolCalls: [], finish: null, usage: null };

    function handleParts(parts) {
      if (!parts) return;
      parts.forEach(function (part) {
        if (part.text) { res.text += part.text; if (o.onDelta) o.onDelta(part.text); }
        if (part.functionCall) {
          res.toolCalls.push({
            id: U.uid('call'), name: part.functionCall.name, args: part.functionCall.args || {}
          });
        }
      });
    }

    if (!o.stream) {
      return App.Http.request({ url: url, method: 'POST', headers: headers, body: JSON.stringify(body), timeout: o.timeout || 180000 })
        .then(function (r) {
          var j = safeJson(r.text, null);
          if (r.status < 200 || r.status >= 300) throw errFrom(r.status, j, r.text);
          var cand = j && j.candidates && j.candidates[0];
          if (cand) { handleParts(cand.content && cand.content.parts); res.finish = cand.finishReason; }
          if (j && j.usageMetadata) res.usage = j.usageMetadata;
          return res;
        });
    }

    var parser = sseParser(function (ev) {
      var d = ev.data; if (!d) return;
      if (d.error) { res.error = d.error.message || String(d.error); return; }
      var cand = d.candidates && d.candidates[0];
      if (cand) { handleParts(cand.content && cand.content.parts); if (cand.finishReason) res.finish = cand.finishReason; }
      if (d.usageMetadata) res.usage = d.usageMetadata;
    });

    return App.Http.request({
      url: url, method: 'POST', headers: headers, body: JSON.stringify(body),
      timeout: o.timeout || 180000, onChunk: parser
    }).then(function (r) {
      if (r.status < 200 || r.status >= 300) throw errFrom(r.status, safeJson(r.text, null), r.text);
      if (res.error) throw new Error(res.error);
      return res;
    });
  }

  /* --------------------------- 3) Anthropic --------------------------- */
  function sendAnthropic(o) {
    var p = o.provider;
    var url = U.joinUrl(p.baseUrl, '/messages');
    var body = {
      model: o.model,
      max_tokens: o.maxTokens || 4096,
      messages: toAnthropic(o.messages, o.system),
      stream: !!o.stream
    };
    if (o.system) body.system = o.system;
    if (typeof o.temperature === 'number') body.temperature = o.temperature;
    var tools = anthropicTools(o.tools);
    if (tools) body.tools = tools;

    var headers = P.headersFor(p, true);
    var res = { text: '', toolCalls: [], finish: null, usage: null };

    if (!o.stream) {
      return App.Http.request({ url: url, method: 'POST', headers: headers, body: JSON.stringify(body), timeout: o.timeout || 180000 })
        .then(function (r) {
          var j = safeJson(r.text, null);
          if (r.status < 200 || r.status >= 300) throw errFrom(r.status, j, r.text);
          (j.content || []).forEach(function (b) {
            if (b.type === 'text') { res.text += b.text; if (o.onDelta) o.onDelta(b.text); }
            if (b.type === 'tool_use') res.toolCalls.push({ id: b.id, name: b.name, args: b.input || {} });
          });
          res.finish = j.stop_reason;
          res.usage = j.usage;
          return res;
        });
    }

    var blocks = {};
    var parser = sseParser(function (ev) {
      var d = ev.data; if (!d) return;
      if (d.type === 'error' && d.error) { res.error = d.error.message; return; }
      if (d.type === 'content_block_start' && d.content_block) {
        blocks[d.index] = { type: d.content_block.type, id: d.content_block.id, name: d.content_block.name, json: '' };
      }
      if (d.type === 'content_block_delta' && d.delta) {
        if (d.delta.type === 'text_delta') {
          res.text += d.delta.text; if (o.onDelta) o.onDelta(d.delta.text);
        } else if (d.delta.type === 'input_json_delta') {
          var b = blocks[d.index] || (blocks[d.index] = { json: '' });
          b.json += d.delta.partial_json || '';
        }
      }
      if (d.type === 'message_delta') {
        if (d.delta && d.delta.stop_reason) res.finish = d.delta.stop_reason;
        if (d.usage) res.usage = d.usage;
      }
    });

    return App.Http.request({
      url: url, method: 'POST', headers: headers, body: JSON.stringify(body),
      timeout: o.timeout || 180000, onChunk: parser
    }).then(function (r) {
      if (r.status < 200 || r.status >= 300) throw errFrom(r.status, safeJson(r.text, null), r.text);
      if (res.error) throw new Error(res.error);
      Object.keys(blocks).forEach(function (k) {
        var b = blocks[k];
        if (b.type === 'tool_use') res.toolCalls.push({ id: b.id || U.uid('call'), name: b.name, args: safeJson(b.json, {}) });
      });
      return res;
    });
  }

  /* --------------------------- الموزّع --------------------------- */
  App.Chat.send = function (o) {
    if (o.provider.type === 'gemini') return sendGemini(o);
    if (o.provider.type === 'anthropic') return sendAnthropic(o);
    return sendOpenAI(o);
  };
})();
