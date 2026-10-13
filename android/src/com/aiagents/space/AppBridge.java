package com.aiagents.space;

import android.app.Activity;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;

/** جسر بسيط لوظائف النظام: رسائل التنبيه وحفظ الملفات على الجهاز. */
public class AppBridge {

    private final Activity act;

    public AppBridge(Activity a) { this.act = a; }

    @JavascriptInterface
    public void toast(final String msg) {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(act, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void saveFile(String name, String b64) {
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            File dir = act.getExternalFilesDir(null);
            if (dir == null) dir = act.getFilesDir();
            File f = new File(dir, name);
            FileOutputStream o = new FileOutputStream(f);
            o.write(data);
            o.close();
            toast("تم حفظ الملف في:\n" + f.getAbsolutePath());
        } catch (Exception e) {
            toast("تعذّر الحفظ: " + e.getMessage());
        }
    }
}
