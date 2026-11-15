package ng.TracKasuwa.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
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
    private static final String UPDATE_ID_KEY = "update_download_id";
    private static final String UPDATE_FILE_KEY = "update_file_name";
    private static final String BADGE_CHANNEL = "trackasuwa_unread";
    private static final int BADGE_NOTIFICATION_ID = 2401;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private File cameraOutputFile;
    private final Handler updateHandler = new Handler(Looper.getMainLooper());
    private boolean updatePolling;
    private boolean installPermissionRequested;
    private final Runnable updatePoll = new Runnable() {
        @Override public void run() {
            checkUpdateDownload();
            if (updatePolling) updateHandler.postDelayed(this, 1500);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public void setCount(int count) {
                runOnUiThread(() -> updateUnreadBadge(Math.max(0, Math.min(count, 999))));
            }
        }, "TrackasuwaBadge");

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
                if (startApkUpdate(url)) return true;
                return false;
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!startApkUpdate(url)) {
                Toast.makeText(this, "Open this download in your browser.", Toast.LENGTH_LONG).show();
            }
        });

        webView.loadUrl(APP_URL);
    }

    private boolean startApkUpdate(String url) {
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || !"github.com".equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !uri.getPath().matches("/Charles5247/TradeTrack/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+/TracKasuwa-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")) {
            return false;
        }
        try {
            if (getPreferences(MODE_PRIVATE).getLong(UPDATE_ID_KEY, -1) >= 0) {
                Toast.makeText(this, "Update is already downloading.", Toast.LENGTH_SHORT).show();
                startUpdatePolling();
                return true;
            }
            String fileName = uri.getLastPathSegment();
            File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (directory == null) throw new IllegalStateException("Update storage is unavailable");
            File target = new File(directory, fileName);
            if (target.exists() && !target.delete()) throw new IllegalStateException("Old update file cannot be replaced");
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle("Trackasuwa update " + fileName);
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            long id = manager.enqueue(request);
            getPreferences(MODE_PRIVATE).edit().putLong(UPDATE_ID_KEY, id).putString(UPDATE_FILE_KEY, fileName).apply();
            Toast.makeText(this, "Downloading update. Keep Trackasuwa open.", Toast.LENGTH_LONG).show();
            startUpdatePolling();
        } catch (Exception error) {
            Toast.makeText(this, "Update could not start. Check your connection and try again.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private void startUpdatePolling() {
        if (updatePolling || getPreferences(MODE_PRIVATE).getLong(UPDATE_ID_KEY, -1) < 0) return;
        updatePolling = true;
        updateHandler.post(updatePoll);
    }

    private void checkUpdateDownload() {
        long id = getPreferences(MODE_PRIVATE).getLong(UPDATE_ID_KEY, -1);
        if (id < 0) return;
        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) { clearUpdate(); return; }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                String fileName = getPreferences(MODE_PRIVATE).getString(UPDATE_FILE_KEY, "");
                File file = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
                if (file.length() > 0) offerInstall(file);
                else { clearUpdate(); Toast.makeText(this, "Update download was empty. Try again.", Toast.LENGTH_LONG).show(); }
            } else if (status == DownloadManager.STATUS_FAILED) {
                clearUpdate();
                Toast.makeText(this, "Update download failed. Check your connection and try again.", Toast.LENGTH_LONG).show();
            }
        } catch (Exception error) {
            clearUpdate();
            Toast.makeText(this, "Could not open the update. Try again.", Toast.LENGTH_LONG).show();
        }
    }

    private void offerInstall(File file) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            if (!installPermissionRequested) {
                installPermissionRequested = true;
                Toast.makeText(this, "Allow Trackasuwa to install this update, then return here.", Toast.LENGTH_LONG).show();
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            }
            return;
        }
        clearUpdate();
        Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(install);
    }

    private void clearUpdate() {
        updatePolling = false;
        updateHandler.removeCallbacks(updatePoll);
        getPreferences(MODE_PRIVATE).edit().remove(UPDATE_ID_KEY).remove(UPDATE_FILE_KEY).apply();
    }

    private void updateUnreadBadge(int count) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (count == 0) {
            manager.cancel(BADGE_NOTIFICATION_ID);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (!getPreferences(MODE_PRIVATE).getBoolean("badge_permission_asked", false)) {
                getPreferences(MODE_PRIVATE).edit().putBoolean("badge_permission_asked", true).apply();
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 2402);
            }
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(BADGE_CHANNEL, "Unread Trackasuwa alerts", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, BADGE_CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Trackasuwa")
                .setContentText(count + " unread notification" + (count == 1 ? "" : "s"))
                .setContentIntent(pending).setAutoCancel(false).setOnlyAlertOnce(true).setNumber(count);
        manager.notify(BADGE_NOTIFICATION_ID, builder.build());
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 2402 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('online'))", null);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        startUpdatePolling();
    }

    @Override protected void onPause() {
        updatePolling = false;
        updateHandler.removeCallbacks(updatePoll);
        super.onPause();
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
