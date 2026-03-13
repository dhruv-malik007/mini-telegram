package com.minitelegram.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecretLaunchPlugin.class);
        super.onCreate(savedInstanceState);
        // Tune WebView for better performance (reduce lag)
        getWindow().getDecorView().post(() -> {
            try {
                WebView wv = getBridge().getWebView();
                if (wv != null) {
                    WebSettings ws = wv.getSettings();
                    ws.setCacheMode(WebSettings.LOAD_DEFAULT);
                    ws.setDomStorageEnabled(true);
                    wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                }
            } catch (Exception ignored) { }
        });
    }
}
