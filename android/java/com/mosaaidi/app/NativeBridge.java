package com.mosaaidi.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/** جسر بين صفحة الويب وتطبيق أندرويد (حفظ الملفات، النسخ، المشاركة، الإشعارات) */
public class NativeBridge {

    private final MainActivity activity;
    private final WebView webView;

    public NativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public String platform() {
        return "android";
    }

    @JavascriptInterface
    public int sdkInt() {
        return Build.VERSION.SDK_INT;
    }

    @JavascriptInterface
    public void toast(final String msg) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(activity, msg == null ? "" : msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private TextToSpeech tts;
    private boolean ttsReady = false;

    /** قراءة نص بصوت نظام أندرويد (WebView لا يدعم speechSynthesis) */
    @JavascriptInterface
    public void speak(final String text) {
        if (text == null || text.trim().isEmpty()) return;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (tts == null) {
                        tts = new TextToSpeech(activity, new TextToSpeech.OnInitListener() {
                            @Override
                            public void onInit(int status) {
                                if (status == TextToSpeech.SUCCESS) {
                                    try {
                                        int r = tts.setLanguage(new Locale("ar"));
                                        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                                            tts.setLanguage(Locale.getDefault());
                                        }
                                        ttsReady = true;
                                        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mosaaidi");
                                    } catch (Exception e) {
                                        Toast.makeText(activity, "تعذّرت القراءة الصوتية", Toast.LENGTH_SHORT).show();
                                    }
                                } else {
                                    Toast.makeText(activity, "تعذّرت القراءة الصوتية على هذا الجهاز", Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                    } else if (ttsReady) {
                        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mosaaidi");
                    }
                } catch (Exception e) {
                    Toast.makeText(activity, "تعذّرت القراءة الصوتية", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @JavascriptInterface
    public void stopSpeaking() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (tts != null) tts.stop();
                } catch (Exception ignored) {
                }
            }
        });
    }

    /** يُستدعى عند إغلاق التطبيق */
    public void shutdown() {
        try {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void copyText(final String text) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("mosaaidi", text == null ? "" : text));
                    Toast.makeText(activity, "تم النسخ", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(activity, "تعذّر النسخ", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @JavascriptInterface
    public void shareText(final String text, final String subject) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                    if (subject != null) i.putExtra(Intent.EXTRA_SUBJECT, subject);
                    activity.startActivity(Intent.createChooser(i, "مشاركة عبر"));
                } catch (Exception ignored) {
                }
            }
        });
    }

    /** حفظ ملف في مجلد التنزيلات (يُستدعى من دالة التنزيل في الواجهة) */
    @JavascriptInterface
    public void saveFile(final String name, final String base64, final String mime) {
        final String safeName = (name == null || name.trim().isEmpty()) ? "file_" + System.currentTimeMillis() : name;
        final String safeMime = (mime == null || mime.trim().isEmpty()) ? "application/octet-stream" : mime;
        new Thread(new Runnable() {
            @Override
            public void run() {
                String message;
                try {
                    byte[] data = Base64.decode(base64, Base64.DEFAULT);
                    String where = writeToDownloads(safeName, safeMime, data);
                    message = "تم الحفظ في: " + where;
                } catch (Exception e) {
                    message = "تعذّر الحفظ: " + e.getMessage();
                }
                final String m = message;
                activity.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(activity, m, Toast.LENGTH_LONG).show();
                    }
                });
            }
        }).start();
    }

    private String writeToDownloads(String name, String mime, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("لم يتم إنشاء الملف");
            OutputStream os = activity.getContentResolver().openOutputStream(uri);
            try {
                os.write(data);
                os.flush();
            } finally {
                try {
                    os.close();
                } catch (Exception ignored) {
                }
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            activity.getContentResolver().update(uri, values, null, null);
            return "مجلد التنزيلات / Download";
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = activity.getExternalFilesDir(null);
        if (dir == null) dir = activity.getFilesDir();
        if (!dir.exists()) dir.mkdirs();
        File out = uniqueFile(dir, name);
        FileOutputStream fos = new FileOutputStream(out);
        try {
            fos.write(data);
            fos.flush();
        } finally {
            try {
                fos.close();
            } catch (Exception ignored) {
            }
        }
        return out.getAbsolutePath();
    }

    private static File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            File cand = new File(dir, base + "-" + i + ext);
            if (!cand.exists()) return cand;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }
}
