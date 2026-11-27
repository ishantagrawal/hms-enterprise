const SESSION_MAGIC = [0x56, 0x4e] as const;
const ATTENDANCE_MAGIC = [0x56, 0x4f] as const;

export type SessionAdvertisement = {
  locationId: number;
  nonce: Uint8Array;
  expiresAt: number;
  signature: Uint8Array;
};

export type AttendanceAdvertisement = {
  noncePrefix: Uint8Array;
  rollId: number;
  proof: Uint8Array;
};

export type OfflineSessionQr = {
  session_id: string;
  session_nonce: string;
  expires_at: number;
  location_id: number;
  passkey_challenge?: string;
};

function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('A BLE advertisement UUID must contain 16 bytes.');
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidToBytes(uuid: string): Uint8Array {
  const compact = uuid.replace(/-/g, '');
  if (!/^[\da-f]{32}$/i.test(compact)) throw new Error('Invalid 128-bit BLE UUID.');
  return Uint8Array.from(compact.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, false);
}

export function parseSessionAdvertisement(uuid: string): SessionAdvertisement | null {
  const bytes = uuidToBytes(uuid);
  if (bytes[0] !== SESSION_MAGIC[0] || bytes[1] !== SESSION_MAGIC[1]) return null;
  return {
    locationId: (bytes[2] << 8) | bytes[3],
    nonce: bytes.slice(4, 8),
    expiresAt: readUint32(bytes, 8),
    signature: bytes.slice(12, 16)
  };
}

export async function verifySessionAdvertisement(
  advertisement: SessionAdvertisement,
  key: CryptoKey,
  locationId: number
): Promise<boolean> {
  if (advertisement.locationId !== locationId || advertisement.expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const signedBytes = new Uint8Array(12);
  signedBytes.set(SESSION_MAGIC, 0);
  signedBytes[2] = locationId >>> 8;
  signedBytes[3] = locationId & 0xff;
  signedBytes.set(advertisement.nonce, 4);
  writeUint32(signedBytes, 8, advertisement.expiresAt);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, signedBytes));
  return signature.length >= 4
    && signature[0] === advertisement.signature[0]
    && signature[1] === advertisement.signature[1]
    && signature[2] === advertisement.signature[2]
    && signature[3] === advertisement.signature[3];
}

export async function createAttendanceAdvertisement(
  nonce: Uint8Array,
  rollId: number,
  key: CryptoKey
): Promise<string> {
  if (nonce.length !== 4) throw new Error('The active BLE session nonce must be 4 bytes.');
  if (!Number.isInteger(rollId) || rollId < 0 || rollId > 0xffffffff) {
    throw new Error('The student roll ID must be an unsigned 32-bit integer.');
  }
  const message = new Uint8Array(8);
  message.set(nonce, 0);
  writeUint32(message, 4, rollId);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  if (digest.length < 8) throw new Error('The device key did not produce a valid HMAC-SHA256 digest.');
  return attendanceUuidFromProof(nonce, rollId, digest.slice(0, 8));
}

export function attendanceUuidFromProof(nonce: Uint8Array, rollId: number, proof: Uint8Array): string {
  if (nonce.length !== 4) throw new Error('The active BLE session nonce must be 4 bytes.');
  if (proof.length !== 8) throw new Error('The attendance proof must contain 8 bytes.');
  if (!Number.isInteger(rollId) || rollId < 0 || rollId > 0xffffffff) {
    throw new Error('The student roll ID must be an unsigned 32-bit integer.');
  }
  const packet = new Uint8Array(16);
  packet.set(ATTENDANCE_MAGIC, 0);
  packet.set(nonce.slice(0, 2), 2);
  writeUint32(packet, 4, rollId);
  packet.set(proof, 8);
  return bytesToUuid(packet);
}

export function parseAttendanceAdvertisement(uuid: string): AttendanceAdvertisement | null {
  const bytes = uuidToBytes(uuid);
  if (bytes[0] !== ATTENDANCE_MAGIC[0] || bytes[1] !== ATTENDANCE_MAGIC[1]) return null;
  return {
    noncePrefix: bytes.slice(2, 4),
    rollId: readUint32(bytes, 4),
    proof: bytes.slice(8, 16)
  };
}

export function parseOfflineSessionQr(value: string): {
  sessionId: string;
  nonce: Uint8Array;
  expiresAt: number;
  passkeyChallenge?: string;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch (error) {
    throw new Error('The session QR code is not valid JSON.', { cause: error });
  }
  if (!payload || typeof payload !== 'object') throw new Error('The session QR code is invalid.');
  const item = payload as Record<string, unknown>;
  if (typeof item.session_id !== 'string' || !/^[\da-f]{8}$/i.test(String(item.session_nonce || ''))
    || typeof item.expires_at !== 'number' || !Number.isInteger(item.expires_at)) {
    throw new Error('The session QR code is missing required attendance fields.');
  }
  const passkeyChallenge = typeof item.passkey_challenge === 'string' ? item.passkey_challenge : undefined;
  if (passkeyChallenge) {
    const normalized = passkeyChallenge.replace(/-/g, '+').replace(/_/g, '/');
    let challengeBytes;
    try {
      challengeBytes = Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0));
    } catch (error) {
      throw new Error('The session QR contains an invalid passkey challenge.', { cause: error });
    }
    if (challengeBytes.length !== 32) throw new Error('The session QR contains an invalid passkey challenge.');
  }
  return {
    sessionId: item.session_id,
    nonce: Uint8Array.from(String(item.session_nonce).match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16)),
    expiresAt: item.expires_at,
    passkeyChallenge
  };
}

export function createOfflineSessionQr(value: OfflineSessionQr): string {
  if (!value.session_id.trim() || !/^[\da-f]{8}$/i.test(value.session_nonce)
    || !Number.isInteger(value.expires_at) || !Number.isInteger(value.location_id)
    || value.location_id < 0 || value.location_id > 0xffff
    || (value.passkey_challenge && !/^[\da-z_-]+$/i.test(value.passkey_challenge))) {
    throw new Error('The session QR fields are invalid.');
  }
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(
          ([key, nested]) => [key, normalize(nested)]
        )
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function startJitteredBroadcast(start: () => Promise<void>): number {
  const delay = Math.floor(Math.random() * 1501);
  return window.setTimeout(() => {
    void start().catch((error: unknown) => console.error('Could not start attendance BLE advertising:', error));
  }, delay);
}
