package ng.TracKasuwa.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/**
 * TracKasuwa Android shell.
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

    // Launch URL is a Gradle-generated BuildConfig field (see
    // android-app/app/build.gradle's defaultConfig.buildConfigField),
    // not a hardcoded literal — this lets the production domain be
    // overridden at build time via `-PappUrl=https://...` without
    // touching this file. Defaults to https://trackasuwa.vercel.app/login when
    // no -PappUrl is supplied. See android-app/README.md → "Rebuilding
    // with a different domain".
    private static final String APP_URL = BuildConfig.APP_URL;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;

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

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;

                Intent galleryIntent = params.createIntent();
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);

                Intent cameraIntent = null;
                if (params.isCaptureEnabled()) {
                    cameraIntent = createCameraIntent();
                }

                Intent chooserIntent;
                if (cameraIntent != null) {
                    chooserIntent = new Intent(Intent.ACTION_CHOOSER);
                    chooserIntent.putExtra(Intent.EXTRA_INTENT, galleryIntent);
                    chooserIntent.putExtra(Intent.EXTRA_TITLE, "Choose product file");
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                            new Intent[]{cameraIntent});
                } else {
                    chooserIntent = galleryIntent;
                }

                try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (ActivityNotFoundException error) {
                    finishFileChooser(null);
                    return false;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep in-app navigation inside the WebView as long as it is
                // the TracKasuwa origin; anything else, we still just load
                // in-place since there is no companion browser affordance
                // for this minimal shell.
                return false;
            }
        });

        webView.loadUrl(APP_URL);
    }

    private Intent createCameraIntent() {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getPackageManager()) == null) return null;

        File photoFile;
        try {
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
                    .format(new Date());
            File directory = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            photoFile = File.createTempFile("tradetrack_" + timestamp + "_",
                    ".jpg", directory);
        } catch (IOException error) {
            return null;
        }

        cameraOutputUri = FileProvider.getUriForFile(this,
                "ng.TracKasuwa.app.fileprovider", photoFile);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return intent;
    }

    private void finishFileChooser(Uri[] results) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraOutputUri = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) return;

        Uri[] results = null;
        if (resultCode == Activity.RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (cameraOutputUri != null) {
                results = new Uri[]{cameraOutputUri};
            }
        }
        finishFileChooser(results);
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
