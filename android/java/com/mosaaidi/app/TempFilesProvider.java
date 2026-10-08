package com.mosaaidi.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;

/**
 * مزوّد محتوى صغير لتمرير ملف مؤقت (صورة الكاميرا) إلى تطبيق الكاميرا عبر content:// URI
 * بدون الحاجة إلى مكتبات خارجية (AndroidX).
 */
public class TempFilesProvider extends ContentProvider {

    public static final String AUTHORITY = "com.mosaaidi.app.files";
    private static final String DIR = "shared";

    public static Uri uriFor(Context ctx, File file) {
        return Uri.parse("content://" + AUTHORITY + "/" + file.getName());
    }

    private File resolve(String name) {
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws java.io.FileNotFoundException {
        File f = resolve(uri.getLastPathSegment());
        int flags = "r".equals(mode)
                ? ParcelFileDescriptor.MODE_READ_ONLY
                : (ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_TRUNCATE);
        return ParcelFileDescriptor.open(f, flags);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f = resolve(uri.getLastPathSegment());
        String[] cols = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
            else row[i] = null;
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n != null && n.toLowerCase().endsWith(".mp4")) return "video/mp4";
        return "image/jpeg";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        File f = resolve(uri.getLastPathSegment());
        return f.delete() ? 1 : 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
