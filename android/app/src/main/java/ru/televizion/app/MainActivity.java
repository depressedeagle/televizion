package ru.televizion.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Добавляем нативный интерфейс и разрешаем автовоспроизведение медиа
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            // Аппаратное ускорение на уровне View для слабых Smart TV
            webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

            android.webkit.WebSettings settings = webView.getSettings();
            // Разрешаем видео стартовать сразу без обязательного клика/тапа
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);

            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void exitApp() {
                    runOnUiThread(() -> finish());
                }
            }, "AndroidNativeApp");
        }
    }

    /**
     * Перехват аппаратной кнопки "Назад" (Back / стрелка назад) на пульте Smart TV.
     * Предотвращает внезапный вылет из приложения и передает управление в интерфейс.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.post(() -> {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('tv_hardware_back'));",
                        null
                    );
                });
                return true; // Предотвращаем дефолтный выход из Activity
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
