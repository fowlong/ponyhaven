import { doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './storage';
import type { MeadowRoom } from './types';
import { desktop } from './desktop';
import { party } from './peer-party';

export interface Invitation {
  fromUid: string;
  fromName: string;
  code: string;
  expiresAt: number;
}
export class SharedMeadow {
  room: MeadowRoom | null = null;
  invitation: Invitation | null = null;
  onChange = () => {};
  onInvitation = () => {};
  private unsubscribe = () => {};
  private stopInvitations = () => {};
  private closing = false;
  constructor() {
    if (desktop) party.onChange = () => { this.room = party.room; this.onChange(); };
  }
  get isHost() {
    if (desktop) return party.isHost;
    return !!this.room && this.room.hostUid === auth?.currentUser?.uid;
  }
  get code() {
    return this.room?.code || '';
  }
  private ready() {
    if (!db || !auth?.currentUser) throw new Error('Connect the free backend and sign in to visit friends.');
    return { database: db, uid: auth.currentUser.uid };
  }
  async start() {
    if (desktop) return;
    if (!db || !auth?.currentUser) return;
    this.stopInvitations = onSnapshot(doc(db, 'invitations', auth.currentUser.uid), (snap) => {
      const i = snap.exists() ? (snap.data() as Invitation) : null;
      this.invitation = i && i.expiresAt > Date.now() ? i : null;
      this.onInvitation();
    });
    const uid = auth.currentUser.uid;
    const code = sessionStorage.getItem('ponyhaven:room:' + uid);
    if (code) await this.join(code).catch(() => sessionStorage.removeItem('ponyhaven:room:' + uid));
  }
  async host(name: string, background: string, customBackground: string, time: 'day' | 'night') {
    if (desktop) return party.create(name, background, customBackground, time);
    const { database, uid } = this.ready();
    await this.leave();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
      if ((await getDoc(doc(database, 'rooms', code))).exists()) continue;
      const room = {
        hostUid: uid,
        hostName: name,
        background,
        customBackground,
        time,
        updatedAt: serverTimestamp(),
        expiresAt: Date.now() + 8 * 3600000,
      };
      await setDoc(doc(database, 'rooms', code), room);
      await this.join(code);
      return code;
    }
    throw new Error('Could not create a join code. Please try again.');
  }
  async join(value: string) {
    if (desktop) return party.join(value);
    const { database, uid } = this.ready();
    const code = value.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('Enter the eight-character meadow code.');
    const snapshot = await getDoc(doc(database, 'rooms', code));
    if (!snapshot.exists() || snapshot.data().expiresAt < Date.now())
      throw new Error('That meadow has closed or the code has expired.');
    if (this.code && this.code !== code) await this.leave();
    this.unsubscribe();
    this.room = {
      code,
      ...snapshot.data(),
      updatedAt: snapshot.data().updatedAt?.toMillis?.() || Date.now(),
    } as MeadowRoom;
    sessionStorage.setItem('ponyhaven:room:' + uid, code);
    this.onChange();
    this.unsubscribe = onSnapshot(doc(database, 'rooms', code), (snap) => {
      if (this.closing) return;
      if (!snap.exists() || snap.data().expiresAt < Date.now()) {
        this.room = null;
        sessionStorage.removeItem('ponyhaven:room:' + uid);
        this.onChange();
        return;
      }
      this.room = {
        code,
        ...snap.data(),
        updatedAt: snap.data().updatedAt?.toMillis?.() || Date.now(),
      } as MeadowRoom;
      this.onChange();
    });
  }
  async background(background: string, customBackground: string, time: 'day' | 'night') {
    if (desktop) return party.background(background, customBackground, time);
    const { database } = this.ready();
    if (!this.room || !this.isHost) throw new Error('The host chooses this meadow’s background.');
    await setDoc(
      doc(database, 'rooms', this.code),
      {
        background,
        customBackground,
        time,
        updatedAt: serverTimestamp(),
        expiresAt: Date.now() + 8 * 3600000,
      },
      { merge: true },
    );
  }
  async invite(targetUid: string, name: string) {
    if (desktop) throw new Error('Share the party code to invite a friend. Everyone in your party is already here.');
    const { database, uid } = this.ready();
    if (!this.room) throw new Error('Host a meadow first.');
    await setDoc(doc(database, 'invitations', targetUid), {
      fromUid: uid,
      fromName: name,
      code: this.code,
      expiresAt: Date.now() + 5 * 60000,
    });
  }
  async dismissInvitation() {
    if (db && auth?.currentUser) await deleteDoc(doc(db, 'invitations', auth.currentUser.uid));
    this.invitation = null;
    this.onInvitation();
  }
  async leave() {
    if (desktop) return party.leave();
    if (!this.room) return;
    const room = this.room;
    const host = this.isHost;
    this.closing = true;
    this.unsubscribe();
    try {
      if (host && db) await deleteDoc(doc(db, 'rooms', room.code));
    } finally {
      this.room = null;
      this.closing = false;
      if (auth?.currentUser) sessionStorage.removeItem('ponyhaven:room:' + auth.currentUser.uid);
      this.onChange();
    }
  }
  dispose() {
    this.unsubscribe();
    this.stopInvitations();
  }
}
export async function roomBackground(blob: Blob | null): Promise<string> {
  if (!blob) return '';
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1024 / image.width, 576 / image.height);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  for (const quality of [0.75, 0.55, 0.35]) {
    const data = canvas.toDataURL('image/webp', quality);
    if (data.length < 480000) return data;
  }
  throw new Error('This background is too detailed to share. Try a smaller image or a built-in view.');
}
