package com.loktron.tronpay;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final String NOTIFICATION_CHANNEL = "digirupee_updates";
    private static final String REFERRAL_MARKER = "DIGIRUPEE_REF:";
    private static final String LOCAL_OFFLINE_URL = "file:///android_asset/offline.html";
    private WebView webView;
    private View loadingOverlay;
    private ValueCallback<Uri[]> fileCallback;
    private boolean showingOfflinePage = false;
    private String appUrl;
    private Uri appOrigin;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(252, 251, 247));
        getWindow().setNavigationBarColor(Color.rgb(252, 251, 247));
        int systemFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) systemFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(systemFlags);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) getWindow().setDecorFitsSystemWindows(false);

        createNotificationChannel();

        FrameLayout rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(252, 251, 247));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(252, 251, 247));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        rootView.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        loadingOverlay = createLoadingOverlay();
        rootView.addView(loadingOverlay, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(rootView);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            rootView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            rootView.requestApplyInsets();
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " digiRupee/1.0.9 eMoney/" + BuildConfig.VERSION_NAME);
        webView.addJavascriptInterface(new DigiAndroidBridge(), "DigiAndroid");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppOrigin(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isAppOrigin(Uri.parse(url))) {
                    showingOfflinePage = false;
                    hideLoadingScreen();
                    CookieManager.getInstance().flush();
                    requestNotificationPermission();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) showOfflinePage();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Always start from the current hosted digiRupee document.
        // Restoring a saved WebView DOM can briefly resurrect an older rendered
        // shell before the current hosted UI scripts run.
        loadWebApp();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL, "eMoney updates", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Trade, payout, reward and account updates");
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private void showNativeNotification(String title, String message) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new android.app.Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_emoney_notification)
                .setContentTitle(title == null || title.isEmpty() ? "eMoney" : title)
                .setContentText(message == null ? "" : message)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(message == null ? "" : message))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);
        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    private String consumeReferralMarker() {
        try {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard == null || !clipboard.hasPrimaryClip()) return "";
            ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence rawValue = clip.getItemAt(0).coerceToText(this);
            String raw = rawValue == null ? "" : rawValue.toString().trim().toUpperCase();
            if (!raw.startsWith(REFERRAL_MARKER)) return "";
            String code = raw.substring(REFERRAL_MARKER.length()).trim();
            if (!code.matches("DGR[A-F0-9]{10}")) return "";
            clipboard.setPrimaryClip(ClipData.newPlainText("eMoney", ""));
            return code;
        } catch (Exception ignored) {
            return "";
        }
    }

    private final class DigiAndroidBridge {
        @JavascriptInterface
        public void copyText(String value) {
            if (value == null || value.length() > 1000000) return;
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("eMoney", value));
            });
        }

        @JavascriptInterface
        public void shareText(String value) {
            if (value == null || value.length() > 1000000) return;
            runOnUiThread(() -> {
                try {
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/plain");
                    share.putExtra(Intent.EXTRA_TEXT, value);
                    startActivity(Intent.createChooser(share, "Share from eMoney"));
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestNotificationPermission);
        }

        @JavascriptInterface
        public void notify(String title, String message) {
            runOnUiThread(() -> showNativeNotification(title, message));
        }

        @JavascriptInterface
        public String consumeReferralMarker() {
            return MainActivity.this.consumeReferralMarker();
        }
    }

    private String configuredAppUrl() {
        String configured = BuildConfig.WEB_APP_URL == null ? "" : BuildConfig.WEB_APP_URL.trim();
        Uri configuredUri = Uri.parse(configured);
        if (!"https".equalsIgnoreCase(configuredUri.getScheme()) || configuredUri.getHost() == null) {
            throw new IllegalStateException("eMoney production URL must use HTTPS");
        }
        String path = configuredUri.getPath();
        if (path == null || path.isEmpty() || path.endsWith("/")) {
            String basePath = path == null || path.isEmpty() ? "/" : path;
            return configuredUri.buildUpon().path(basePath + "digirupee-app.html").clearQuery().fragment(null).build().toString();
        }
        if (!path.endsWith("/digirupee-app.html")) throw new IllegalStateException("Configured URL must be digiRupee app page or hosted root");
        return configuredUri.toString();
    }

    private boolean isAppOrigin(Uri uri) {
        if (uri == null || appOrigin == null) return false;
        int configuredPort = appOrigin.getPort() == -1 ? 443 : appOrigin.getPort();
        int requestedPort = uri.getPort() == -1 && "https".equalsIgnoreCase(uri.getScheme()) ? 443 : uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) && appOrigin.getHost() != null && appOrigin.getHost().equalsIgnoreCase(uri.getHost()) && configuredPort == requestedPort;
    }

    private void openExternal(Uri uri) {
        String scheme = uri == null ? null : uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
    }

    private void loadWebApp() {
        try {
            showLoadingScreen();
            appUrl = configuredAppUrl();
            appOrigin = Uri.parse(appUrl);
            showingOfflinePage = false;
            Uri freshUri = Uri.parse(appUrl).buildUpon()
                    .appendQueryParameter("app_boot", "emoney-" + BuildConfig.VERSION_NAME)
                    .build();
            webView.loadUrl(freshUri.toString());
        } catch (Exception error) {
            showOfflinePage();
        }
    }

    private void showOfflinePage() {
        hideLoadingScreen();
        if (showingOfflinePage) return;
        showingOfflinePage = true;
        String retryUrl = appUrl == null ? "" : appUrl.replace("\\", "%5C").replace("'", "%27");
        String html = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fcfbf7;color:#102b22;font-family:Arial,sans-serif}"
                + ".box{max-width:360px;padding:24px;text-align:center}h1{font-size:22px}p{color:#596b63;line-height:1.5}"
                + "button{border:0;border-radius:8px;padding:13px 18px;background:#075537;color:#fff;font-weight:700}</style></head>"
                + "<body><div class=\"box\"><h1>eMoney could not connect</h1><p>An internet connection is required to use the secure application.</p>"
                + "<button onclick=\"location.href='" + retryUrl + "'\">Retry</button></div></body></html>";
        webView.loadDataWithBaseURL(LOCAL_OFFLINE_URL, html, "text/html", "UTF-8", null);
    }

    private boolean isNightMode() {
        return (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    private View createLoadingOverlay() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(28, 28, 28, 28);
        panel.setBackgroundColor(isNightMode() ? Color.rgb(13, 26, 21) : Color.rgb(252, 251, 247));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_emoney);
        logo.setContentDescription("eMoney");
        logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        panel.addView(logo, new LinearLayout.LayoutParams(92, 92));

        TextView title = new TextView(this);
        title.setText("eMoney");
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        title.setTextColor(isNightMode() ? Color.rgb(238, 248, 240) : Color.rgb(16, 43, 34));
        panel.addView(title, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView subtitle = new TextView(this);
        subtitle.setText("Loading your secure account…");
        subtitle.setTextSize(14);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setTextColor(isNightMode() ? Color.rgb(173, 197, 182) : Color.rgb(89, 107, 99));
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = 8;
        panel.addView(subtitle, subtitleParams);

        ProgressBar progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(42, 42);
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.topMargin = 22;
        panel.addView(progress, progressParams);
        return panel;
    }

    private void showLoadingScreen() { if (loadingOverlay != null) loadingOverlay.setVisibility(View.VISIBLE); }
    private void hideLoadingScreen() { if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE); }

    private void fallbackBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onSaveInstanceState(Bundle outState) { webView.saveState(outState); super.onSaveInstanceState(outState); }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            Uri[] results = resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (showingOfflinePage) {
            loadWebApp();
            return;
        }
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("(function(){try{return !!(window.__digiHandleBack&&window.__digiHandleBack());}catch(e){return false;}})()", value -> {
            if ("true".equalsIgnoreCase(String.valueOf(value))) return;
            fallbackBack();
        });
    }
}
