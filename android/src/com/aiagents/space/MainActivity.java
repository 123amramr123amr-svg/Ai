package com.aiagents.space;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    /** نطاق محلي نخدم منه ملفات التطبيق، فيصبح المصدر https حقيقيًا
     *  (وبذلك يعمل localStorage بثقة على كل أجهزة أندرويد). */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private static final String INJECT =
        "(function(){ if(window.__injected) return; window.__injected=1;" +
        "window.__isApp=true;" +
        "window.NativeHttp={available:true," +
        "start:function(id,m,u,h,b){ window.__NativeBridge.start(id,m,u,h,b||''); }," +
        "abort:function(id){ window.__NativeBridge.abort(id); }};" +
        "window.__nativeSave=function(name,b64){ window.NativeApp.saveFile(name,b64); };" +
        "})();";

    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "application/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("svg", "image/svg+xml");
        MIME.put("txt", "text/plain");
    }

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_REQ = 1001;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        web.setBackgroundColor(0xFF000101);
        web.addJavascriptInterface(new HttpBridge(web), "__NativeBridge");
        web.addJavascriptInterface(new AppBridge(this), "NativeApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                try {
                    Uri u = req.getUrl();
                    if (u != null && HOST.equals(u.getHost())) {
                        String path = u.getPath();
                        if (path == null || path.length() == 0 || path.equals("/")) path = "/index.html";
                        String asset = path.startsWith("/") ? path.substring(1) : path;
                        try {
                            InputStream is = getAssets().open(asset);
                            String mime = guessMime(asset);
                            if (mime.startsWith("image/")) {
                                return new WebResourceResponse(mime, null, is);
                            }
                            return new WebResourceResponse(mime, "utf-8", is);
                        } catch (IOException e) {
                            return new WebResourceResponse("text/plain", "utf-8", null);
                        }
                    }
                } catch (Throwable ignored) { }
                return null;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                v.evaluateJavascript(INJECT, null);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript(INJECT, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url != null && url.indexOf(HOST) < 0
                    && (url.startsWith("http://") || url.startsWith("https://"))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) { }
                    return true;
                }
                return false;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQ);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
        requestNotifPermission();

    }

    private void requestNotifPermission() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 2001);
                }
            }
        } catch (Throwable ignored) { }
    }

    private static String guessMime(String path) {
        int i = path.lastIndexOf('.');
        if (i < 0) return "text/plain";
        String ext = path.substring(i + 1).toLowerCase();
        String m = MIME.get(ext);
        return m == null ? "text/plain" : m;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILE_REQ) {
            if (filePathCallback != null) {
                Uri[] result = null;
                if (res == RESULT_OK && data != null && data.getData() != null) {
                    result = new Uri[] { data.getData() };
                }
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
            "(function(){try{if(window.App&&App.UI&&App.UI.currentTab!=='providers'){App.UI.tab('providers');return 'handled';}}catch(e){}return 'exit';})()",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value == null || value.indexOf("handled") < 0) {
                        MainActivity.super.onBackPressed();
                    }
                }
            });
    }
}
