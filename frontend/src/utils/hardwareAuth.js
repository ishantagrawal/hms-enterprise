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
