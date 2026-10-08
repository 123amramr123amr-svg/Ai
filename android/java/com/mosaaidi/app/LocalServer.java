package com.mosaaidi.app;

import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * سيرفر HTTP محلي صغير جدًا يعمل على 127.0.0.1 داخل التطبيق.
 *
 * لماذا؟ لأن المتصفح المدمج (WebView) لا يعتبر file:// بيئة آمنة،
 * فلا تعمل الميكروفون/الكاميرا/Service Worker. أما http://127.0.0.1
 * فهي بيئة آمنة (Secure Context) ويُسمح فيها بكل ذلك.
 */
public class LocalServer {

    private static final String ROOT = "www";

    private final AssetManager assets;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private ServerSocket server;
    private volatile boolean running = false;
    private int port = -1;

    public LocalServer(AssetManager assets) {
        this.assets = assets;
    }

    public int getPort() {
        return port;
    }

    public void start() throws IOException {
        server = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        port = server.getLocalPort();
        running = true;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                while (running) {
                    try {
                        final Socket socket = server.accept();
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                handle(socket);
                            }
                        });
                    } catch (IOException e) {
                        if (running) {
                            // نتجاهل الأخطاء العابرة
                        }
                    }
                }
            }
        }, "mosaaidi-http");
        t.setDaemon(true);
        t.start();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (Exception ignored) {
        }
        pool.shutdownNow();
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(20000);
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null) {
                socket.close();
                return;
            }
            int contentLength = 0;
            String header;
            while ((header = readLine(in)) != null && header.length() > 0) {
                int c = header.indexOf(':');
                if (c > 0 && header.substring(0, c).trim().equalsIgnoreCase("Content-Length")) {
                    try {
                        contentLength = Integer.parseInt(header.substring(c + 1).trim());
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
            for (int i = 0; i < contentLength; i++) {
                if (in.read() < 0) break;
            }

            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "GET";
            String path = parts.length > 1 ? parts[1] : "/";

            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                sendText(out, 405, "Method Not Allowed", "text/plain");
                socket.close();
                return;
            }

            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            int h = path.indexOf('#');
            if (h >= 0) path = path.substring(0, h);
            try {
                path = URLDecoder.decode(path, "UTF-8");
            } catch (Exception ignored) {
            }
            if (path.length() == 0 || "/".equals(path)) path = "/index.html";
            if (path.contains("..")) {
                sendText(out, 403, "Forbidden", "text/plain");
                socket.close();
                return;
            }

            byte[] data = null;
            try {
                data = readAsset(ROOT + path);
            } catch (IOException e) {
                if (path.indexOf('.') < 0) {
                    try {
                        data = readAsset(ROOT + "/index.html");
                    } catch (IOException ignored) {
                    }
                }
            }
            if (data == null) {
                sendText(out, 404, "Not Found: " + path, "text/plain");
                socket.close();
                return;
            }

            String head = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + mimeOf(path) + "\r\n"
                    + "Content-Length: " + data.length + "\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "Service-Worker-Allowed: /\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(head.getBytes("UTF-8"));
            if (!"HEAD".equals(method)) out.write(data);
            out.flush();
            socket.close();
        } catch (Exception ignored) {
            try {
                socket.close();
            } catch (Exception ignored2) {
            }
        }
    }

    private byte[] readAsset(String path) throws IOException {
        InputStream is = assets.open(path);
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(1024, is.available()));
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } finally {
            try {
                is.close();
            } catch (IOException ignored) {
            }
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(128);
        int c;
        boolean any = false;
        while ((c = in.read()) >= 0) {
            any = true;
            if (c == '\n') break;
            if (c != '\r') bos.write(c);
        }
        if (!any && bos.size() == 0) return null;
        return new String(bos.toByteArray(), "UTF-8");
    }

    private static void sendText(OutputStream out, int code, String text, String mime) throws IOException {
        byte[] body = text.getBytes("UTF-8");
        String head = "HTTP/1.1 " + code + " " + (code == 404 ? "Not Found" : "Error") + "\r\n"
                + "Content-Type: " + mime + "; charset=utf-8\r\n"
                + "Content-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes("UTF-8"));
        out.write(body);
        out.flush();
    }

    public static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html; charset=utf-8";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json")) return "application/json; charset=utf-8";
        if (p.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }
}
