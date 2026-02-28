package com.minitelegram.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.SharedPreferences;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SecretLaunch")
public class SecretLaunchPlugin extends Plugin {

    private static final String PREFS_NAME = "secret_launch";
    private static final String KEY_PIN_HASH = "pin_hash";
    private static final String KEY_DIAL_NUMBER = "dial_number";
    private static final String DEFAULT_DIAL_NUMBER = "123456";

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
    }

    private static String hashPin(String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(pin.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }

    @PluginMethod
    public void setPin(PluginCall call) {
        String pin = call.getString("pin");
        if (pin == null || pin.isEmpty()) {
            call.reject("PIN is required");
            return;
        }
        if (pin.length() > 8) {
            call.reject("PIN must be at most 8 digits");
            return;
        }
        String hash = hashPin(pin);
        if (hash == null) {
            call.reject("Failed to save PIN");
            return;
        }
        getPrefs().edit().putString(KEY_PIN_HASH, hash).apply();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getDialNumber(PluginCall call) {
        String number = getPrefs().getString(KEY_DIAL_NUMBER, DEFAULT_DIAL_NUMBER);
        JSObject ret = new JSObject();
        ret.put("dialNumber", number);
        call.resolve(ret);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        String hash = getPrefs().getString(KEY_PIN_HASH, null);
        boolean enabled = hash != null && !hash.isEmpty();
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearPin(PluginCall call) {
        getPrefs().edit().remove(KEY_PIN_HASH).apply();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
