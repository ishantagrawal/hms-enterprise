package com.hmsenterprise.portal;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

@CapacitorPlugin(name = "HardwareAuth")
public class HardwareAuthPlugin extends Plugin {
    private static final String KEY_ALIAS = "hms-attendance-signing-key-v1";

    @PluginMethod
    public void generateKeyPair(PluginCall call) {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            try {
                generator.initialize(new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setIsStrongBoxBacked(true)
                        .build());
                generator.generateKeyPair();
            } catch (Exception strongBoxUnavailable) {
                generator.initialize(new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .build());
                generator.generateKeyPair();
            }
            java.security.KeyStore store = java.security.KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            KeyPair pair = new KeyPair(store.getCertificate(KEY_ALIAS).getPublicKey(),
                    (PrivateKey) store.getKey(KEY_ALIAS, null));
            JSObject result = new JSObject();
            result.put("public_key", Base64.encodeToString(pair.getPublic().getEncoded(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Hardware-backed signing key could not be created.", error);
        }
    }

    @PluginMethod
    public void signPayload(PluginCall call) {
        String payload = call.getString("payload", "");
        if (payload.isEmpty()) {
            call.reject("A payload is required.");
            return;
        }
        try {
            java.security.KeyStore store = java.security.KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            PrivateKey key = (PrivateKey) store.getKey(KEY_ALIAS, null);
            if (key == null) {
                call.reject("The hardware signing key is not enrolled.");
                return;
            }
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(key);
            signer.update(payload.getBytes(StandardCharsets.UTF_8));
            JSObject result = new JSObject();
            result.put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("The attendance payload could not be signed.", error);
        }
    }
}
