import { attendanceUuidFromProof } from './reverseBle.ts';
import { registerPlugin } from '@capacitor/core';

const HardwareAuth = registerPlugin('HardwareAuth');

export async function getHardwarePublicKey() {
  const result = await HardwareAuth.generateKeyPair();
  if (!result?.public_key) throw new Error('The device signing key was not returned.');
  return result.public_key;
}

export async function signAttendancePayload(payload) {
  const result = await HardwareAuth.signPayload({ payload });
  if (!result?.signature) throw new Error('The device attendance signature was not returned.');
  return result.signature;
}

export async function getBleKeyAgreementPublicKey() {
  const result = await HardwareAuth.getBleKeyAgreementPublicKey();
  if (!result?.public_key) throw new Error('The hardware BLE key-agreement public key was not returned.');
  return result.public_key;
}

export async function installBleHmacKey(encryptedKey) {
  await HardwareAuth.installBleHmacKey({
    ephemeral_public_key: encryptedKey.ble_key_ephemeral_public_key,
    salt: encryptedKey.ble_key_salt,
    nonce: encryptedKey.ble_key_nonce,
    ciphertext: encryptedKey.ble_key_ciphertext
  });
}

export async function computeBleAttendanceProof(nonce, rollId) {
  const result = await HardwareAuth.computeBleAttendanceProof({ nonce, roll_id: rollId });
  if (!result?.proof) throw new Error('The hardware BLE attendance proof was not returned.');
  return result.proof;
}

export async function startBleAdvertising(uuid) {
  await HardwareAuth.startBleAdvertising({ uuid });
}

export async function stopBleAdvertising() {
  await HardwareAuth.stopBleAdvertising();
}

export async function broadcastAttendanceForFiveSeconds(nonce, rollId) {
  const delay = Math.floor(Math.random() * 1501);
  await new Promise((resolve) => window.setTimeout(resolve, delay));
  const proof = await computeBleAttendanceProof(nonce, rollId);
  const proofBytes = Uint8Array.from(proof.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  const nonceBytes = Uint8Array.from(nonce.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  const uuid = attendanceUuidFromProof(nonceBytes, rollId, proofBytes);
  await startBleAdvertising(uuid);
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 5000));
  } finally {
    await stopBleAdvertising();
  }
  return { uuid };
}

export async function broadcastIosAttendanceForFiveSeconds(sessionNonce, rollId, attendanceToken) {
  if (!/^[\da-f]{8}$/i.test(sessionNonce)) {
    throw new Error('The active attendance session nonce must be 4 bytes.');
  }
  if (!/^[\da-f]{16}$/i.test(attendanceToken)) {
    throw new Error('The server-issued attendance token must be 8 bytes.');
  }
  const nonceBytes = Uint8Array.from(
    sessionNonce.match(/.{2}/g),
    (byte) => Number.parseInt(byte, 16)
  );
  const tokenBytes = Uint8Array.from(
    attendanceToken.match(/.{2}/g),
    (byte) => Number.parseInt(byte, 16)
  );
  const uuid = attendanceUuidFromProof(nonceBytes, rollId, tokenBytes);
  const delay = Math.floor(Math.random() * 1501);
  await new Promise((resolve) => window.setTimeout(resolve, delay));
  await startBleAdvertising(uuid);
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 5000));
  } finally {
    await stopBleAdvertising();
  }
  return { uuid };
}
