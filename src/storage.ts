import { desktop } from './desktop';
export { auth, db, cloudConfigured, companion, loginEmail, accountLogin } from './cloud';
export { SaveStore } from './save-store';
export interface Preferences {
  reducedMotion: boolean;
  quiet: boolean;
  time: 'day' | 'night';
  background: string | null;
}
const defaults: Preferences = {
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  quiet: false,
  time: 'day',
  background: null,
};
export function getPreferences(): Preferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(preferenceKey()) || '{}') };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(p: Preferences) {
  localStorage.setItem(preferenceKey(), JSON.stringify(p));
}
function preferenceKey() { return desktop ? 'ponyhaven:preferences:' + (localStorage.getItem('ponyhaven:active-profile') || 'default') : 'ponyhaven:preferences'; }
function backgroundDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ponyhaven-backgrounds', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function backgroundBlob(blob?: Blob | null): Promise<Blob | null> {
  const db = await backgroundDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('images', blob === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('images');
      const key = desktop ? localStorage.getItem('ponyhaven:active-profile') || 'custom' : 'custom';
      const req =
        blob === undefined
          ? store.get(key)
          : blob === null
            ? store.delete(key)
            : store.put(blob, key);
      let result: Blob | null = null;
      req.onsuccess = () => {
        result = blob === undefined ? req.result || null : blob || null;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function prepareBackground(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / bitmap.width, 1080 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not read this image.'))),
      'image/webp',
      0.86,
    ),
  );
}
