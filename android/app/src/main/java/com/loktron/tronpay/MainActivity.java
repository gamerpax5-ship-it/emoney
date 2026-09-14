package com.loktron.tronpay;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String LOCAL_OFFLINE_URL = "file:///android_asset/offline.html";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private boolean showingOfflinePage = false;
    private String appUrl;
    private Uri appOrigin;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 5, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 5, 18));
        getWindow().getDecorView().setSystemUiVisibility(0);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 5, 18));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        setContentView(webView);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            webView.requestApplyInsets();
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
        settings.setUserAgentString(settings.getUserAgentString() + " digiRupee/1.0.4");

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
                    CookieManager.getInstance().flush();
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
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            }
        });

        if (savedInstanceState == null) loadWebApp();
        else webView.restoreState(savedInstanceState);
    }

    private String configuredAppUrl() {
        String configured = BuildConfig.WEB_APP_URL == null ? "" : BuildConfig.WEB_APP_URL.trim();
        Uri configuredUri = Uri.parse(configured);
        if (!"https".equalsIgnoreCase(configuredUri.getScheme()) || configuredUri.getHost() == null) {
            throw new IllegalStateException("digiRupee production URL must use HTTPS");
        }
        String path = configuredUri.getPath();
        if (path == null || path.isEmpty() || path.endsWith("/")) {
            String basePath = path == null || path.isEmpty() ? "/" : path;
            return configuredUri.buildUpon().path(basePath + "digirupee-app.html").clearQuery().fragment(null).build().toString();
        }
        if (!path.endsWith("/digirupee-app.html")) {
            throw new IllegalStateException("Configured URL must be digiRupee app page or hosted root");
        }
        return configuredUri.toString();
    }

    private boolean isAppOrigin(Uri uri) {
        if (uri == null || appOrigin == null) return false;
        int configuredPort = appOrigin.getPort() == -1 ? 443 : appOrigin.getPort();
        int requestedPort = uri.getPort() == -1 && "https".equalsIgnoreCase(uri.getScheme()) ? 443 : uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme())
                && appOrigin.getHost() != null
                && appOrigin.getHost().equalsIgnoreCase(uri.getHost())
                && configuredPort == requestedPort;
    }

    private void openExternal(Uri uri) {
        String scheme = uri == null ? null : uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
    }

    private void loadWebApp() {
        try {
            appUrl = configuredAppUrl();
            appOrigin = Uri.parse(appUrl);
            showingOfflinePage = false;
            webView.loadUrl(appUrl);
        } catch (Exception error) {
            showOfflinePage();
        }
    }

    private void showOfflinePage() {
        if (showingOfflinePage) return;
        showingOfflinePage = true;
        String retryUrl = appUrl == null ? "" : appUrl.replace("\\", "%5C").replace("'", "%27");
        String html = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070512;color:#fff;font-family:Arial,sans-serif}"
                + ".box{max-width:360px;padding:24px;text-align:center}h1{font-size:22px}p{color:#c9c4df;line-height:1.5}"
                + "button{border:0;border-radius:8px;padding:13px 18px;background:#7c4dff;color:#fff;font-weight:700}</style></head>"
                + "<body><div class=\"box\"><h1>digiRupee could not connect</h1><p>An internet connection is required to use the secure application.</p>"
                + "<button onclick=\"location.href='" + retryUrl + "'\">Retry</button></div></body></html>";
        webView.loadDataWithBaseURL(LOCAL_OFFLINE_URL, html, "text/html", "UTF-8", null);
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
        if (showingOfflinePage) loadWebApp();
        else if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
