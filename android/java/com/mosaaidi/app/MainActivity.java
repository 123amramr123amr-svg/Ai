package com.mosaaidi.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** الشاشة الرئيسية: تعرض التطبيق داخل WebView مع سيرفر محلي للأصول */
public class MainActivity extends Activity {

    private static final int REQ_PERMS = 1001;
    private static final int REQ_FILE = 1002;
    private static final String BG = "#0b1020";

    private WebView web;
    private ProgressBar progress;
    private LocalServer server;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutputUri;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(BG));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BG));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                s.setSafeBrowsingEnabled(false);
            } catch (Throwable ignored) {
            }
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    if ("127.0.0.1".equals(host) || "localhost".equals(host)) return false;
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception ignored) {
                        }
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    startFileChooser(params);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "تعذّر فتح مدير الملفات", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progress == null) return;
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        web.addJavascriptInterface(new NativeBridge(this, web), "MosaaidiNative");

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this);
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(90, 90);
        pp.gravity = android.view.Gravity.CENTER;
        progress.setLayoutParams(pp);
        root.addView(progress);

        setContentView(root);

        requestAppPermissions();
        startServerAndLoad();
    }

    private void startServerAndLoad() {
        try {
            server = new LocalServer(getAssets());
            server.start();
            web.loadUrl("http://127.0.0.1:" + server.getPort() + "/index.html");
        } catch (Exception e) {
            // خطة بديلة: التحميل من ملفات التطبيق مباشرة
            web.loadUrl("file:///android_asset/www/index.html");
        }
    }

    private boolean acceptsMedia(String[] accept) {
        if (accept == null || accept.length == 0) return true;
        for (String a : accept) {
            if (a == null) continue;
            String t = a.toLowerCase();
            if (t.startsWith("image/") || t.startsWith("video/") || t.equals("*/*")) return true;
        }
        return false;
    }

    private void startFileChooser(WebChromeClient.FileChooserParams params) {
        Intent content = new Intent(Intent.ACTION_GET_CONTENT);
        content.addCategory(Intent.CATEGORY_OPENABLE);

        String[] accept = params.getAcceptTypes();
        boolean any = true;
        if (accept != null) {
            for (String a : accept) {
                if (a != null && a.trim().length() > 0) {
                    any = false;
                    break;
                }
            }
        }
        content.setType(any ? "*/*" : accept[0]);
        if (accept != null && accept.length > 1) {
            content.putExtra(Intent.EXTRA_MIME_TYPES, accept);
        }
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        Intent chooser = Intent.createChooser(content, "اختر ملفًا");

        if (params.isCaptureEnabled() && acceptsMedia(accept)) {
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cam.resolveActivity(getPackageManager()) != null) {
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, "cam_" + System.currentTimeMillis() + ".jpg");
                cameraOutputUri = TempFilesProvider.uriFor(this, out);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            }
        }

        startActivityForResult(chooser, REQ_FILE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data == null || (data.getData() == null && data.getClipData() == null)) {
                    if (cameraOutputUri != null) result = new Uri[]{cameraOutputUri};
                } else if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else {
                    result = new Uri[]{data.getData()};
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            cameraOutputUri = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void requestAppPermissions() {
        List<String> need = new ArrayList<>();
        addIfMissing(need, Manifest.permission.RECORD_AUDIO);
        addIfMissing(need, Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT < 29) addIfMissing(need, Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (!need.isEmpty()) {
            try {
                requestPermissions(need.toArray(new String[0]), REQ_PERMS);
            } catch (Exception ignored) {
            }
        }
    }

    private void addIfMissing(List<String> list, String perm) {
        try {
            if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) list.add(perm);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        try {
            if (server != null) server.stop();
        } catch (Exception ignored) {
        }
        try {
            if (web != null) {
                web.loadUrl("about:blank");
                web.destroy();
            }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
