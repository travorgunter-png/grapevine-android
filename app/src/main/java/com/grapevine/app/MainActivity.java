package com.grapevine.app;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.NetworkCapabilities;
import android.os.Build;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.view.Gravity;
import android.view.View;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final int DOWNLOAD_PERMISSION_REQUEST = 4102;
    private String pendingDownloadUrl;
    private String pendingDownloadFilename;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView webView;
    private FrameLayout rootLayout;
    private String pendingAuthUrl;
    private boolean webReady=false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(17,24,39));
        getWindow().setNavigationBarColor(Color.WHITE);

        rootLayout = new FrameLayout(this);
        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(rootLayout);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4103);
        }
        com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token ->
            getSharedPreferences(GrapevineFirebaseMessagingService.PREFS, MODE_PRIVATE).edit().putString(GrapevineFirebaseMessagingService.TOKEN, token).apply());
        showMafiaBossSplash();

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

    private void showMafiaBossSplash() {
        final LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setGravity(Gravity.CENTER);
        splash.setBackgroundColor(Color.rgb(17, 24, 39));
        splash.setClickable(true);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.grapevine_icon_foreground);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(220), dp(220));
        logoParams.bottomMargin = dp(20);
        splash.addView(logo, logoParams);

        TextView brand = new TextView(this);
        brand.setText("GRAPEVINE");
        brand.setTextColor(Color.WHITE);
        brand.setTextSize(27);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        brand.setGravity(Gravity.CENTER);
        splash.addView(brand);

        TextView powered = new TextView(this);
        powered.setText("Powered By Mafia Boss");
        powered.setTextColor(Color.rgb(213, 168, 76));
        powered.setTextSize(15);
        powered.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams poweredParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        poweredParams.topMargin = dp(12);
        splash.addView(powered, poweredParams);

        rootLayout.addView(splash, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (splash.getParent() == rootLayout) rootLayout.removeView(splash);
        }, 1500);
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private boolean hasNetworkConnection() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network network = cm.getActiveNetwork();
                NetworkCapabilities caps = network == null ? null : cm.getNetworkCapabilities(network);
                return caps != null
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            }
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
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

    public class GrapevineBridge {
        @JavascriptInterface
        public String getFirebaseToken() {
            return getSharedPreferences(GrapevineFirebaseMessagingService.PREFS, MODE_PRIVATE).getString(GrapevineFirebaseMessagingService.TOKEN, "");
        }

        private final MainActivity activity;
        private final Context context;
        GrapevineBridge(MainActivity activity) { this.activity = activity; this.context = activity; }

        @JavascriptInterface
        public boolean isNetworkAvailable() {
            return activity.hasNetworkConnection();
        }

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
            activity.runOnUiThread(() -> {
                try {
                    Uri uri = Uri.parse(url == null ? "" : url);
                    String scheme = uri.getScheme();
                    if (uri.getHost() == null || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                        Toast.makeText(context, "Invalid media download link", Toast.LENGTH_LONG).show();
                        return;
                    }
                    String safeName = (filename == null || filename.trim().isEmpty()) ? "grapevine-media" : filename.replaceAll("[^A-Za-z0-9._-]", "-");
                    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
                            context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        activity.pendingDownloadUrl = uri.toString();
                        activity.pendingDownloadFilename = safeName;
                        activity.requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, DOWNLOAD_PERMISSION_REQUEST);
                        return;
                    }
                    enqueuePublicDownload(uri.toString(), safeName);
                } catch (Exception e) {
                    Toast.makeText(context, "Download could not start", Toast.LENGTH_LONG).show();
                }
            });
        }

        private void enqueuePublicDownload(String url, String filename) {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(filename);
                request.setDescription("Downloading GRAPEVINE media");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) throw new IllegalStateException("Download service unavailable");
                dm.enqueue(request);
                Toast.makeText(context, "Downloading to the device Downloads folder", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(context, "Download could not start. Check storage permission and connection.", Toast.LENGTH_LONG).show();
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

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == DOWNLOAD_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED &&
                    pendingDownloadUrl != null && pendingDownloadFilename != null) {
                String url = pendingDownloadUrl;
                String filename = pendingDownloadFilename;
                pendingDownloadUrl = null;
                pendingDownloadFilename = null;
                new GrapevineBridge(this).enqueuePublicDownload(url, filename);
            } else {
                pendingDownloadUrl = null;
                pendingDownloadFilename = null;
                Toast.makeText(this, "Storage permission is needed to save files to Downloads on this Android version.", Toast.LENGTH_LONG).show();
            }
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
