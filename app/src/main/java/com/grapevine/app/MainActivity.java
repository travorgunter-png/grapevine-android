package com.grapevine.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.widget.Toast;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView webView;
    private String pendingAuthUrl;
    private boolean webReady=false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(17,24,39));
        getWindow().setNavigationBarColor(Color.WHITE);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new GrapevineBridge(this), "GrapevineAndroid");
        webView.setWebViewClient(new AssetClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*", "audio/*"});
                picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(picker, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    fallback.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*", "audio/*"});
                    fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(fallback, FILE_CHOOSER_REQUEST);
                }
                return true;
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/index.html");
        handleAuthIntent(getIntent());
    }

    private void handleAuthIntent(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"grapevine".equalsIgnoreCase(data.getScheme()) || !"auth-callback".equalsIgnoreCase(data.getHost())) return;
        pendingAuthUrl = data.toString();
        deliverPendingAuth();
    }

    private void deliverPendingAuth() {
        if (!webReady || pendingAuthUrl == null || webView == null) return;
        String js;
        try {
            js = "window.handleGrapevineAuthCallback(" + JSONObject.quote(pendingAuthUrl) + ");";
        } catch (Exception e) {
            return;
        }
        pendingAuthUrl = null;
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthIntent(intent);
    }

    public static class GrapevineBridge {
        private final Context context;
        GrapevineBridge(Context context) { this.context = context; }

        @JavascriptInterface
        public void openEmail() {
            try {
                Intent intent = new Intent(Intent.ACTION_MAIN);
                intent.addCategory(Intent.CATEGORY_APP_EMAIL);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent intent = new Intent(Intent.ACTION_SENDTO);
                    intent.setData(Uri.parse("mailto:"));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                } catch (Exception ignored) {
                    Toast.makeText(context, "Open your email app and check Inbox, Spam/Junk or Promotions", Toast.LENGTH_LONG).show();
                }
            }
        }

        @JavascriptInterface
        public void downloadMedia(String url, String filename) {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(filename == null || filename.isEmpty() ? "GRAPEVINE media" : filename);
                request.setDescription("Downloading GRAPEVINE media");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);
                request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, filename == null || filename.isEmpty() ? "grapevine-media" : filename);
                DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(request);
                Toast.makeText(context, "Download started", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(context, "Download could not start", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private class AssetClient extends WebViewClient {
        @Override public void onPageFinished(WebView view, String url) {
            webReady = true;
            deliverPendingAuth();
            super.onPageFinished(view, url);
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return false; }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return serve(request.getUrl().getPath()); }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            try { return serve(Uri.parse(url).getPath()); } catch (Exception e) { return null; }
        }
        private WebResourceResponse serve(String path) {
            if (path == null || path.equals("/")) path = "/index.html";
            String asset = path.startsWith("/") ? path.substring(1) : path;
            try {
                InputStream in = getAssets().open(asset);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext(asset));
                if (mime == null) mime = "application/octet-stream";
                String encoding = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("xml") ? "UTF-8" : null;
                return new WebResourceResponse(mime, encoding, in);
            } catch (IOException ignored) { return null; }
        }
        private String ext(String name) {
            int i = name.lastIndexOf('.');
            return i >= 0 ? name.substring(i + 1).toLowerCase(Locale.US) : "";
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (filePathCallback != null) { filePathCallback.onReceiveValue(null); filePathCallback = null; }
        webReady = false;
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        super.onDestroy();
    }
}
