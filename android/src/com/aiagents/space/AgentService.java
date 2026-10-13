package com.aiagents.space;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * خدمة أمامية بسيطة تُبقي عملية التطبيق حيّة حتى يستمر استقبال رسائل تليجرام
 * والرد عليها والتطبيق في الخلفية.
 */
public class AgentService extends Service {

    private static final String CHANNEL = "agents_space";
    private static final int NOTIF_ID = 1101;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        try {
            startForeground(NOTIF_ID, buildNotification());
        } catch (Throwable ignored) { }
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel c = new NotificationChannel(
                    CHANNEL, "الوكيل يعمل", NotificationManager.IMPORTANCE_LOW);
                c.setShowBadge(false);
                nm.createNotificationChannel(c);
            }
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, flags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            ? new Notification.Builder(this, CHANNEL)
            : new Notification.Builder(this);
        b.setContentTitle("مساحة الوكلاء")
         .setContentText("الوكيل يستقبل رسائل تليجرام الآن")
         .setSmallIcon(android.R.drawable.stat_notify_sync)
         .setContentIntent(pi)
         .setOngoing(true);
        return b.build();
    }
}
