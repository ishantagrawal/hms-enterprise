const ATTENDANCE_MAGIC = [0x56, 0x4f] as const;

function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('A BLE advertisement UUID must contain 16 bytes.');
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, false);
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
