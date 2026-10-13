package com.aiagents.space;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * جسر شبكة أصلي: ينفّذ طلبات HTTP من داخل التطبيق ويرسل النتائج (مع البث)
 * إلى جافاسكريبت، لتجاوز قيود CORS في WebView.
 */
public class HttpBridge {

    private final WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ConcurrentHashMap<String, Thread> threads = new ConcurrentHashMap<String, Thread>();

    public HttpBridge(WebView web) { this.web = web; }

    @JavascriptInterface
    public void start(final String id, final String method, final String url,
                      final String headersJson, final String bodyB64) {
        Thread t = new Thread(new Runnable() {
            @Override public void run() { perform(id, method, url, headersJson, bodyB64); }
        }, "http-" + id);
        threads.put(id, t);
        t.start();
    }

    @JavascriptInterface
    public void abort(String id) {
        Thread t = threads.remove(id);
        if (t != null) t.interrupt();
        call("window.__nh && window.__nh.end(" + js(id) + "," + js("تم الإلغاء") + ");");
    }

    private void perform(String id, String method, String url, String headersJson, String bodyB64) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(url);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
            conn.setConnectTimeout(25000);
            conn.setReadTimeout(300000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("Accept", "*/*");
            conn.setRequestProperty("Accept-Language", "ar,en;q=0.8");

            if (headersJson != null && headersJson.length() > 2) {
                JSONObject hs = new JSONObject(headersJson);
                Iterator<String> it = hs.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    if (k != null && !k.isEmpty()) conn.setRequestProperty(k, hs.optString(k, ""));
                }
            }

            if (bodyB64 != null && bodyB64.length() > 0) {
                conn.setDoOutput(true);
                byte[] payload = Base64.decode(bodyB64, Base64.DEFAULT);
                conn.setFixedLengthStreamingMode(payload.length);
                OutputStream os = conn.getOutputStream();
                os.write(payload);
                os.flush();
                os.close();
            }

            int status = conn.getResponseCode();

            StringBuilder hb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                String key = e.getKey();
                if (key == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                if (!first) hb.append(",");
                first = false;
                hb.append(js(key.toLowerCase())).append(":").append(js(e.getValue().get(0)));
            }
            hb.append("}");
            call("window.__nh && window.__nh.headers(" + js(id) + "," + status + "," + js(hb.toString()) + ");");

            InputStream in = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (Thread.currentThread().isInterrupted()) break;
                    String b64 = Base64.encodeToString(Arrays.copyOf(buf, n), Base64.NO_WRAP);
                    call("window.__nh && window.__nh.chunk(" + js(id) + "," + js(b64) + ");");
                }
                in.close();
            }
            threads.remove(id);
            call("window.__nh && window.__nh.end(" + js(id) + "," + js("") + ");");

        } catch (Exception ex) {
            threads.remove(id);
            String msg = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            call("window.__nh && window.__nh.end(" + js(id) + "," + js(msg) + ");");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void call(final String jsCode) {
        ui.post(new Runnable() {
            @Override public void run() {
                try { web.evaluateJavascript(jsCode, null); } catch (Exception ignored) { }
            }
        });
    }

    /** تهريب نص إلى حرف JS آمن. */
    static String js(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\u2028': b.append("\\u2028"); break;
                case '\u2029': b.append("\\u2029"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        b.append("\"");
        return b.toString();
    }
}
