import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorIbeacon } from '@capgo/capacitor-ibeacon';

export function useBeaconScanner(targetBeacon) {
  const [rssi, setRssi] = useState(null);
  const [inRange, setInRange] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const handleRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    if (!targetBeacon?.uuid) {
      setRssi(null);
      setInRange(false);
      return undefined;
    }

    const region = {
      identifier: `attendance-${targetBeacon.uuid}-${targetBeacon.major}-${targetBeacon.minor}`,
      uuid: targetBeacon.uuid,
      major: Number(targetBeacon.major),
      minor: Number(targetBeacon.minor)
    };
    const mockMode = import.meta.env.VITE_BEACON_MOCK === 'true' || !Capacitor.isNativePlatform();

    const start = async () => {
      setError('');
      setScanning(true);
      try {
        if (mockMode) {
          const timer = window.setInterval(() => {
            if (disposed) return;
            const mockRssi = -72;
            setRssi(mockRssi);
            setInRange(mockRssi >= Number(targetBeacon.min_rssi ?? -78));
          }, 1000);
          handleRef.current = { remove: () => window.clearInterval(timer) };
          return;
        }

        await CapacitorIbeacon.requestWhenInUseAuthorization();
        const available = await CapacitorIbeacon.isRangingAvailable();
        if (!available.available) {
          throw new Error('Beacon ranging is not available on this device.');
        }
        const listener = await CapacitorIbeacon.addListener('didRangeBeacons', (event) => {
          if (disposed) return;
          const match = (event.beacons || []).find((beacon) =>
            beacon.uuid?.toLowerCase() === targetBeacon.uuid.toLowerCase()
            && Number(beacon.major) === Number(targetBeacon.major)
            && Number(beacon.minor) === Number(targetBeacon.minor)
          );
          if (!match) {
            setRssi(null);
            setInRange(false);
            return;
          }
          setRssi(match.rssi);
          setInRange(match.rssi >= Number(targetBeacon.min_rssi ?? -78));
        });
        handleRef.current = listener;
        await CapacitorIbeacon.startRangingBeaconsInRegion(region);
      } catch (scanError) {
        if (!disposed) setError(scanError?.message || 'Could not start beacon scanning.');
      }
    };

    start();
    return () => {
      disposed = true;
      setScanning(false);
      handleRef.current?.remove?.();
      if (!mockMode) {
        CapacitorIbeacon.stopRangingBeaconsInRegion(region).catch(() => {});
      }
    };
  }, [targetBeacon?.uuid, targetBeacon?.major, targetBeacon?.minor, targetBeacon?.min_rssi]);

  return { rssi, inRange, error, scanning };
}