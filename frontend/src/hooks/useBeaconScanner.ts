import { useCallback, useEffect, useState } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

type BeaconOptions = {
  enabled?: boolean;
  uuid?: string;
  beaconCode?: string;
  beacons?: Array<{ beacon_code: string; min_rssi?: number }>;
  major?: number;
  minor?: number;
  minRssi?: number;
};

type ScanResult = {
  manufacturerData?: Map<number, unknown> | Record<string, unknown>;
  rssi: number;
};

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof DataView) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function parseIBeacon(result: ScanResult) {
  const entries = result?.manufacturerData;
  const data = entries instanceof Map
    ? entries.get(0x004c)
    : entries?.[0x004c] ?? entries?.['76'];
  const bytes = bytesOf(data);
  if (!bytes || bytes.length < 25 || bytes[0] !== 0x02 || bytes[1] !== 0x15) return null;
  const uuid = Array.from(bytes.slice(2, 18), (byte) => byte.toString(16).padStart(2, '0')).join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return {
    uuid,
    major: (bytes[18] << 8) | bytes[19],
    minor: (bytes[20] << 8) | bytes[21],
    rssi: Number(result.rssi)
  };
}

export function useBeaconScanner(options: BeaconOptions = {}) {
  const { enabled = true, uuid, beaconCode, beacons = [], major, minor, minRssi = -78 } = options;
  const [rssi, setRssi] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rotatingUuid, setRotatingUuid] = useState('');
  const [simulation, setSimulation] = useState(false);
  const [error, setError] = useState('');
  const native = Capacitor.isNativePlatform();

  const startSimulation = useCallback(() => {
    setError('');
    setSimulation(true);
    setRssi(-72);
    setInRange(-72 >= minRssi);
    setScanning(true);
    setRotatingUuid('');
  }, [minRssi]);

  const stopSimulation = useCallback(() => {
    setSimulation(false);
    setScanning(false);
    setRssi(null);
    setInRange(false);
    setRotatingUuid('');
  }, []);

  useEffect(() => {
    if (!enabled || simulation || !native) return undefined;
    let active = true;
    let scanStarted = false;

    const start = async () => {
      try {
        await BleClient.initialize();
        await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
          if (!active) return;
          const beacon = parseIBeacon(result);
          if (!beacon) return;
          const beaconHex = beacon.uuid.replace(/-/g, '').toLowerCase();
          const configured = beacons.find((item) => item.beacon_code.toLowerCase() === beaconHex.slice(0, 8))
            || (beaconCode && beaconHex.slice(0, 8) === beaconCode.replace(/[^0-9a-f]/gi, '').toLowerCase()
              ? { beacon_code: beaconCode, min_rssi: minRssi }
              : null);
          const matches = configured
            || (!beaconCode && !beacons.length && (!uuid || beacon.uuid.toLowerCase() === uuid.toLowerCase()))
            && (major === undefined || beacon.major === major)
            && (minor === undefined || beacon.minor === minor);
          if (!matches) return;
          setRssi(beacon.rssi);
          setRotatingUuid(beacon.uuid);
          setInRange(beacon.rssi >= Number(configured?.min_rssi ?? minRssi));
        });
        scanStarted = true;
        if (active) setScanning(true);
      } catch (scanError) {
        if (active) {
          setScanning(false);
          setError(scanError instanceof Error ? scanError.message : 'Beacon scanning could not start.');
        }
      }
    };

    void start();
    return () => {
      active = false;
      if (scanStarted) void BleClient.stopLEScan().catch((scanError) => console.error('Could not stop BLE scan:', scanError));
    };
  }, [beaconCode, beacons, enabled, major, minRssi, minor, native, simulation, uuid]);

  return {
    rssi,
    inRange,
    scanning,
    rotatingUuid,
    error,
    simulation,
    simulationAvailable: !native,
    startSimulation,
    stopSimulation
  };
}
