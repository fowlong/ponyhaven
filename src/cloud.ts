import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer } from 'firebase/firestore';
import { desktop } from './desktop';

const env = import.meta.env;
export const companion = !desktop && env.VITE_COMPANION === 'true';
export const cloudConfigured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
const app = cloudConfigured ? initializeApp({apiKey:env.VITE_FIREBASE_API_KEY, authDomain:env.VITE_FIREBASE_AUTH_DOMAIN, projectId:env.VITE_FIREBASE_PROJECT_ID, appId:env.VITE_FIREBASE_APP_ID}) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
if (env.DEV && env.VITE_USE_EMULATORS === 'true' && auth && db) {
  connectAuthEmulator(auth, 'http://127.0.0.1:19099', {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', 18080);
}
export const loginEmail = (name:string) => name.trim().toLowerCase().includes('@') ? name.trim().toLowerCase() : name.trim().toLowerCase()+'@ponyhaven.example';
export async function accountLogin(name:string, password:string) {
  if (!auth) throw new Error('Accounts are available after the owner connects Firebase.');
  try { await signInWithEmailAndPassword(auth, loginEmail(name), password); }
  catch { throw new Error('Could not sign in. Check the account and password your host gave you.'); }
}
export async function invitation(uid:string) {
  if (!db) throw new Error('Sync has not been configured yet.');
  const permission = await getDocFromServer(doc(db,'allowedUsers',uid));
  if (!permission.exists() || permission.data().enabled !== true) throw new Error('This account has not been invited yet. Ask the owner to enable your account.');
  return String(permission.data().name || 'Friend').slice(0,24);
}
