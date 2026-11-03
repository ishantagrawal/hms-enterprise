const SVNIT_HOSTELS = [
  'Gajjar Bhawan',
  'Bhabha Bhawan',
  'Swami Vivekananda Bhawan',
  'Mother Teresa Bhawan',
  'Nehru Bhawan',
  'Tagore Bhawan',
  'Raman Bhawan',
  'Sarabhai Bhawan'
];

const DEFAULT_WINGS = 'ABCDEFGH'.split('').map((letter) => `Wing ${letter}`);

export function getHostelOptions(configuredHostels, currentHostel, institutionId) {
  const options = new Map(
    (configuredHostels || []).map((hostel) => [hostel.name.toLowerCase(), hostel])
  );
  if (String(institutionId || '').toUpperCase() === 'SVNIT') {
    SVNIT_HOSTELS.forEach((name) => {
      if (!options.has(name.toLowerCase())) {
        options.set(name.toLowerCase(), {
          hostel_id: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
          name,
          wings: DEFAULT_WINGS
        });
      }
    });
  }
  if (currentHostel && !options.has(currentHostel.toLowerCase())) {
    options.set(currentHostel.toLowerCase(), {
      hostel_id: currentHostel,
      name: currentHostel,
      wings: []
    });
  }
  return [...options.values()];
}

export function inferHostelWing(room, configuredWings, currentWing = '') {
  const wings = configuredWings || [];
  const current = wings.find((wing) => wing.toLowerCase() === String(currentWing || '').toLowerCase());
  if (current) return current;

  const roomMatch = String(room || '').trim().match(/^([A-Za-z])(?:[-/\s]|\d)/);
  if (!roomMatch) return '';
  const roomWing = roomMatch[1].toUpperCase();
  return wings.find((wing) => {
    const wingMatch = String(wing).match(/(?:^|\b)Wing\s+([A-Za-z])\b/i)
      || String(wing).match(/^\s*([A-Za-z])\s*(?:Wing)?\s*$/i);
    return wingMatch?.[1]?.toUpperCase() === roomWing;
  }) || '';
}
