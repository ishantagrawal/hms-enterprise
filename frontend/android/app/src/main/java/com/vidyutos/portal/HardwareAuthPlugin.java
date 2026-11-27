package com.vidyutos.portal;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.ParcelUuid;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProtection;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@CapacitorPlugin(name = "HardwareAuth")
@Permission(alias = "bleAdvertise", strings = {
        Manifest.permission.BLUETOOTH_ADVERTISE
})
public class HardwareAuthPlugin extends Plugin {
    private static final String KEY_ALIAS = "hms-attendance-signing-key-v1";
    private static final String BLE_AGREEMENT_ALIAS = "vidyut-attendance-ble-agreement-v1";
    private static final String BLE_HMAC_ALIAS = "vidyut-attendance-ble-hmac-v1";
    private static final byte[] BLE_KEY_INFO = "vidyut-attendance-ble-key-v1".getBytes(StandardCharsets.UTF_8);
    private BluetoothLeAdvertiser bleAdvertiser;
    private AdvertiseCallback advertiseCallback;

    @PluginMethod
    public void generateKeyPair(PluginCall call) {
        try {
            KeyPair pair = getOrCreateSigningKeyPair();
            JSObject result = new JSObject();
            result.put("public_key", Base64.encodeToString(pair.getPublic().getEncoded(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Hardware-backed signing key could not be created.", error);
        }
    }

    private KeyPair getOrCreateSigningKeyPair() throws Exception {
        KeyStore store = loadKeyStore();
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            try {
                generator.initialize(new KeyGenParameterSpec.Builder(
                        KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setIsStrongBoxBacked(true)
                        .build());
                generator.generateKeyPair();
            } catch (Exception strongBoxUnavailable) {
                store = loadKeyStore();
                if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
                generator.initialize(new KeyGenParameterSpec.Builder(
                        KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .build());
                generator.generateKeyPair();
            }
        }
        store = loadKeyStore();
        return new KeyPair(store.getCertificate(KEY_ALIAS).getPublicKey(),
                (PrivateKey) store.getKey(KEY_ALIAS, null));
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

    @PluginMethod
    public void getBleKeyAgreementPublicKey(PluginCall call) {
        try {
            KeyStore store = loadKeyStore();
            if (!store.containsAlias(BLE_AGREEMENT_ALIAS)) {
                KeyPairGenerator generator = KeyPairGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
                generator.initialize(new KeyGenParameterSpec.Builder(
                        BLE_AGREEMENT_ALIAS, KeyProperties.PURPOSE_AGREE_KEY)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .build());
                generator.generateKeyPair();
            }
            JSObject result = new JSObject();
            result.put("public_key", Base64.encodeToString(
                    store.getCertificate(BLE_AGREEMENT_ALIAS).getPublicKey().getEncoded(),
                    Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("A hardware-backed BLE key-agreement key could not be created.", error);
        }
    }

    @PluginMethod
    public void installBleHmacKey(PluginCall call) {
        byte[] sharedSecret = null;
        byte[] wrappingKey = null;
        byte[] bleKey = null;
        try {
            byte[] ephemeralPublicKey = decodeBase64(call, "ephemeral_public_key");
            byte[] salt = decodeBase64(call, "salt");
            byte[] nonce = decodeBase64(call, "nonce");
            byte[] ciphertext = decodeBase64(call, "ciphertext");
            if (salt.length != 16 || nonce.length != 12 || ciphertext.length != 48) {
                call.reject("The encrypted BLE key payload has invalid lengths.");
                return;
            }
            KeyStore store = loadKeyStore();
            Key privateKey = store.getKey(BLE_AGREEMENT_ALIAS, null);
            if (!(privateKey instanceof PrivateKey)) {
                call.reject("The hardware BLE key-agreement key is missing.");
                return;
            }
            PublicKey serverKey = java.security.KeyFactory.getInstance("EC")
                    .generatePublic(new X509EncodedKeySpec(ephemeralPublicKey));
            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init((PrivateKey) privateKey);
            agreement.doPhase(serverKey, true);
            sharedSecret = agreement.generateSecret();
            wrappingKey = hkdfSha256(sharedSecret, salt, BLE_KEY_INFO, 32);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(wrappingKey, "AES"),
                    new GCMParameterSpec(128, nonce));
            cipher.updateAAD(BLE_KEY_INFO);
            bleKey = cipher.doFinal(ciphertext);
            if (bleKey.length != 32) {
                call.reject("The decrypted BLE device key has an invalid length.");
                return;
            }
            KeyStore.ProtectionParameter protection = new KeyProtection.Builder(
                    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build();
            store.setEntry(BLE_HMAC_ALIAS,
                    new KeyStore.SecretKeyEntry(new SecretKeySpec(bleKey, "HmacSHA256")),
                    protection);
            call.resolve();
        } catch (Exception error) {
            call.reject("The BLE device key could not be installed in Android Keystore.", error);
        } finally {
            if (sharedSecret != null) Arrays.fill(sharedSecret, (byte) 0);
            if (wrappingKey != null) Arrays.fill(wrappingKey, (byte) 0);
            if (bleKey != null) Arrays.fill(bleKey, (byte) 0);
        }
    }

    @PluginMethod
    public void computeBleAttendanceProof(PluginCall call) {
        byte[] nonce = null;
        try {
            nonce = decodeHex(call.getString("nonce", ""));
            long rollId = call.getLong("roll_id", -1L);
            if (nonce.length != 4 || rollId < 0 || rollId > 0xffffffffL) {
                call.reject("A 4-byte nonce and unsigned 32-bit roll ID are required.");
                return;
            }
            ByteBuffer message = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN);
            message.put(nonce);
            message.putInt((int) rollId);
            Key key = loadKeyStore().getKey(BLE_HMAC_ALIAS, null);
            if (key == null) {
                call.reject("The device BLE proof key is not enrolled.");
                return;
            }
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            byte[] digest = mac.doFinal(message.array());
            JSObject result = new JSObject();
            result.put("proof", toHex(Arrays.copyOf(digest, 8)));
            Arrays.fill(digest, (byte) 0);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("The attendance BLE proof could not be generated.", error);
        } finally {
            if (nonce != null) Arrays.fill(nonce, (byte) 0);
        }
    }

    @PluginMethod
    public void startBleAdvertising(PluginCall call) {
        if (getPermissionState("bleAdvertise") != PermissionState.GRANTED) {
            requestPermissionForAlias("bleAdvertise", call, "bleAdvertisePermissionCallback");
            return;
        }
        startBleAdvertisingNow(call);
    }

    @PermissionCallback
    private void bleAdvertisePermissionCallback(PluginCall call) {
        if (getPermissionState("bleAdvertise") != PermissionState.GRANTED) {
            call.reject("Bluetooth advertising permission was not granted.");
            return;
        }
        startBleAdvertisingNow(call);
    }

    private void startBleAdvertisingNow(PluginCall call) {
        try {
            String value = call.getString("uuid", "");
            java.util.UUID uuid = java.util.UUID.fromString(value);
            BluetoothManager manager = (BluetoothManager) getContext()
                    .getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
            if (adapter == null || !adapter.isEnabled() || !adapter.isMultipleAdvertisementSupported()) {
                call.reject("This Android device cannot advertise BLE service UUIDs.");
                return;
            }
            bleAdvertiser = adapter.getBluetoothLeAdvertiser();
            if (bleAdvertiser == null) {
                call.reject("BLE advertising is unavailable on this device.");
                return;
            }
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_ADVERTISE)
                    != PackageManager.PERMISSION_GRANTED) {
                call.reject("Bluetooth advertising permission is required.");
                return;
            }
            stopBleAdvertisingNow();
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                    .setConnectable(false)
                    .setTimeout(5000)
                    .build();
            AdvertiseData data = new AdvertiseData.Builder()
                    .setIncludeDeviceName(false)
                    .addServiceUuid(new ParcelUuid(uuid))
                    .build();
            advertiseCallback = new AdvertiseCallback() {
                @Override
                public void onStartFailure(int errorCode) {
                    call.reject("BLE advertising could not start (code " + errorCode + ").");
                }

                @Override
                public void onStartSuccess(AdvertiseSettings appliedSettings) {
                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                }
            };
            bleAdvertiser.startAdvertising(settings, data, advertiseCallback);
        } catch (Exception error) {
            call.reject("The attendance BLE advertisement could not start.", error);
        }
    }

    @PluginMethod
    public void stopBleAdvertising(PluginCall call) {
        try {
            stopBleAdvertisingNow();
            call.resolve();
        } catch (Exception error) {
            call.reject("The attendance BLE advertisement could not stop.", error);
        }
    }

    private void stopBleAdvertisingNow() {
        if (bleAdvertiser != null && advertiseCallback != null) {
            bleAdvertiser.stopAdvertising(advertiseCallback);
            advertiseCallback = null;
        }
    }

    private static KeyStore loadKeyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private static byte[] decodeBase64(PluginCall call, String name) {
        String value = call.getString(name, "");
        if (value.isEmpty()) throw new IllegalArgumentException("Missing encrypted key field: " + name);
        return Base64.decode(value, Base64.DEFAULT);
    }

    private static byte[] decodeHex(String value) {
        if (value == null || !value.matches("(?i)[0-9a-f]{8}")) {
            throw new IllegalArgumentException("The BLE nonce must be exactly 8 hexadecimal characters.");
        }
        byte[] result = new byte[4];
        for (int i = 0; i < result.length; i++) {
            result[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return result;
    }

    private static String toHex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }

    private static byte[] hkdfSha256(byte[] inputKey, byte[] salt, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] pseudoRandomKey = mac.doFinal(inputKey);
        mac.init(new SecretKeySpec(pseudoRandomKey, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        byte[] result = Arrays.copyOf(mac.doFinal(), length);
        Arrays.fill(pseudoRandomKey, (byte) 0);
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        stopBleAdvertisingNow();
        super.handleOnDestroy();
    }
}
