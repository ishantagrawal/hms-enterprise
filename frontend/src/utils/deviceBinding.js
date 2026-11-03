import { Preferences } from '@capacitor/preferences';

function bindingStorageKey(user) {
  const collegeId = user?.college_id || 'college';
  const studentId = user?.user_id || 'student';
  return `hms_device_binding_${collegeId}_${studentId}`;
}

export async function getOrCreateDeviceBindingToken(user) {
  const key = bindingStorageKey(user);
  const stored = await Preferences.get({ key });
  if (stored.value && /^[a-f0-9]{64}$/i.test(stored.value)) {
    return stored.value.toLowerCase();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await Preferences.set({ key, value: token });
  return token;
}

export async function getDeviceBindingToken(user) {
  const stored = await Preferences.get({ key: bindingStorageKey(user) });
  return stored.value && /^[a-f0-9]{64}$/i.test(stored.value)
    ? stored.value.toLowerCase()
    : null;
}
