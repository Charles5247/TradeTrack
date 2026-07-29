package ng.tradetrack.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * TradeTrack Android shell.
 *
 * Mirrors the philosophy of the desktop Electron shell: this is a thin
 * native wrapper around the existing offline-first PWA (service worker +
 * IndexedDB + SyncEngine already handle offline support), not a
 * reimplementation of the app in native code. WebView's own HTTP cache /
 * IndexedDB / Service Worker support (via WebViewCompat/WebSettings) is
 * relied upon to preserve the same offline behavior users get in a
 * mobile browser tab, packaged here as an installable, icon-on-home-screen
 * .apk.
 */
public class MainActivity extends Activity {

    // Default production URL. Override at build/config time if needed by
    // editing this constant (kept simple and dependency-free for this
    // resource-constrained build environment).
    private static final String APP_URL = "https://tradetrack.ng";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep in-app navigation inside the WebView as long as it is
                // the TradeTrack origin; anything else, we still just load
                // in-place since there is no companion browser affordance
                // for this minimal shell.
                return false;
            }
        });

        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
