package ng.TracKasuwa.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
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
import android.widget.Toast;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
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
    private File cameraOutputFile;

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
        // Expose the installed shell version so the web UI can compare it with
        // the published APK without a JavaScript bridge or extra permissions.
        settings.setUserAgentString(settings.getUserAgentString()
                + " TrackasuwaAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;

                boolean image = false;
                if (params.getAcceptTypes() != null) {
                    for (String type : params.getAcceptTypes()) {
                        if (type != null && type.startsWith("image/")) image = true;
                    }
                }
                try {
                    if (image && params.isCaptureEnabled()) {
                        Intent camera = createCameraIntent();
                        if (camera != null) {
                            try {
                                startActivityForResult(camera, FILE_CHOOSER_REQUEST_CODE);
                                return true;
                            } catch (ActivityNotFoundException | SecurityException error) {
                                cameraOutputUri = null;
                                cameraOutputFile = null;
                                Toast.makeText(MainActivity.this, "Camera unavailable; choose an existing photo.", Toast.LENGTH_LONG).show();
                            }
                        }
                    }
                    Intent picker = image ? new Intent(Intent.ACTION_GET_CONTENT) : params.createIntent();
                    if (image) picker.setType("image/*");
                    picker.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(picker, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (ActivityNotFoundException | SecurityException error) {
                    Toast.makeText(MainActivity.this, "No camera or file picker available. Check your device apps.", Toast.LENGTH_LONG).show();
                    finishFileChooser(null);
                    return true;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (openApkDownloadInBrowser(url)) return true;
                return false;
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!openApkDownloadInBrowser(url)) {
                Toast.makeText(this, "Open this download in your browser.", Toast.LENGTH_LONG).show();
            }
        });

        webView.loadUrl(APP_URL);
    }

    private boolean openApkDownloadInBrowser(String url) {
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || !"github.com".equals(uri.getHost())
                || !uri.getPath().matches("/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\\.apk")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No browser is available to download the update.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private Intent createCameraIntent() {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        File photoFile;
        try {
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
                    .format(new Date());
            File directory = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (directory == null) return null;
            photoFile = File.createTempFile("tradetrack_" + timestamp + "_",
                    ".jpg", directory);
        } catch (IOException error) {
            return null;
        }

        cameraOutputUri = FileProvider.getUriForFile(this,
                "ng.TracKasuwa.app.fileprovider", photoFile);
        cameraOutputFile = photoFile;
        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
        intent.setClipData(ClipData.newUri(getContentResolver(), "Product photo", cameraOutputUri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return intent;
    }

    private void finishFileChooser(Uri[] results) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraOutputUri = null;
        cameraOutputFile = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) return;

        Uri[] results = null;
        if (resultCode == Activity.RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (cameraOutputUri != null && cameraOutputFile != null && cameraOutputFile.length() > 0) {
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
