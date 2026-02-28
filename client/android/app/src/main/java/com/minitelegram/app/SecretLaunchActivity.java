package com.minitelegram.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class SecretLaunchActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "secret_launch";
    private static final String KEY_PIN_HASH = "pin_hash";
    private static final String KEY_DIAL_NUMBER = "dial_number";
    private static final String DEFAULT_DIAL_NUMBER = "123456";

    private SharedPreferences prefs;
    private EditText editCode;
    private EditText editPin;
    private Button btnOpen;
    private TextView dialHint;
    private TextView setupMessage;
    private Button btnSetup;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_secret_launch);
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        dialHint = findViewById(R.id.dial_hint);
        editCode = findViewById(R.id.edit_code);
        editPin = findViewById(R.id.edit_pin);
        btnOpen = findViewById(R.id.btn_open);
        setupMessage = findViewById(R.id.setup_message);
        btnSetup = findViewById(R.id.btn_setup);

        String pinHash = prefs.getString(KEY_PIN_HASH, null);
        String dialNumber = prefs.getString(KEY_DIAL_NUMBER, DEFAULT_DIAL_NUMBER);

        if (pinHash == null || pinHash.isEmpty()) {
            // First time: no PIN set — show setup, hide gate
            dialHint.setVisibility(View.GONE);
            editCode.setVisibility(View.GONE);
            editPin.setVisibility(View.GONE);
            btnOpen.setVisibility(View.GONE);
            setupMessage.setVisibility(View.VISIBLE);
            btnSetup.setVisibility(View.VISIBLE);
            btnSetup.setOnClickListener(v -> openMainAndFinish());
        } else {
            setupMessage.setVisibility(View.GONE);
            btnSetup.setVisibility(View.GONE);
            dialHint.setText("Dial: " + dialNumber);
            btnOpen.setOnClickListener(v -> tryOpen());
        }
    }

    private void tryOpen() {
        String code = editCode.getText() != null ? editCode.getText().toString().trim() : "";
        String pin = editPin.getText() != null ? editPin.getText().toString() : "";
        String dialNumber = prefs.getString(KEY_DIAL_NUMBER, DEFAULT_DIAL_NUMBER);
        String storedHash = prefs.getString(KEY_PIN_HASH, "");

        if (!code.equals(dialNumber)) {
            Toast.makeText(this, "Wrong code", Toast.LENGTH_SHORT).show();
            return;
        }
        if (pin.isEmpty()) {
            Toast.makeText(this, "Enter PIN", Toast.LENGTH_SHORT).show();
            return;
        }
        String pinHash = hashPin(pin);
        if (pinHash == null || !pinHash.equals(storedHash)) {
            Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show();
            return;
        }
        openMainAndFinish();
    }

    private void openMainAndFinish() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private static String hashPin(String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(pin.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }
}
