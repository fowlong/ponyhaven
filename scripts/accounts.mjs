// Owner-only local administration. This file is never imported by the web game.
import fs from 'node:fs/promises';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const [action, account] = process.argv.slice(2);
const help = `Ponyhaven account manager (run on the owner's computer)

npm run accounts -- list
npm run accounts -- add username
npm run accounts -- password username
npm run accounts -- rename username
npm run accounts -- disable username
npm run accounts -- enable username
npm run accounts -- remove username

An email address can be used instead of a username. Simple usernames map to
username@ponyhaven.example. Passwords are entered privately in the terminal;
they are never written to a file or committed to GitHub.

Place your Firebase Admin service-account JSON in:
  private/firebase-admin.local.json
or set GOOGLE_APPLICATION_CREDENTIALS to its local path.
See FIREBASE_SETUP.md before running this manager.`;
if (!action || action === '--help') {
  console.log(help);
  process.exit(0);
}
if (!['list', 'add', 'password', 'rename', 'disable', 'enable', 'remove'].includes(action))
  throw new Error('Unknown action. Use --help.');
if (action !== 'list' && !account) throw new Error('Provide a username or email. Use --help.');
if (account && !/^[a-zA-Z0-9._+@-]{1,150}$/.test(account))
  throw new Error('Use letters, digits, dots, hyphens or a valid email.');
const email = account
  ? account.includes('@')
    ? account.toLowerCase()
    : account.toLowerCase() + '@ponyhaven.example'
  : '';
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'private/firebase-admin.local.json';
let key;
try {
  key = JSON.parse(await fs.readFile(credentialPath, 'utf8'));
} catch {
  throw new Error(
    'Local Admin credential not found. Follow FIREBASE_SETUP.md. Never put this key in public/ or GitHub.',
  );
}
initializeApp({ credential: cert(key) });
key = null;
const auth = getAuth(),
  db = getFirestore();
async function ask(prompt, secret = false) {
  if (!process.stdin.isTTY) throw new Error('Run this interactive command in a terminal.');
  const output = secret
    ? new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      })
    : process.stdout;
  if (secret) process.stdout.write(prompt);
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    return (await rl.question(secret ? '' : prompt)).trim();
  } finally {
    rl.close();
    if (secret) process.stdout.write('\n');
  }
}
async function password() {
  const value = await ask('New password (hidden, at least 8 characters): ', true);
  if (value.length < 8) throw new Error('Use at least 8 characters.');
  if (value !== (await ask('Repeat password (hidden): ', true))) throw new Error('Passwords did not match.');
  return value;
}
async function list() {
  let next;
  do {
    const page = await auth.listUsers(1000, next);
    for (const user of page.users)
      console.log(
        `${user.disabled ? 'DISABLED' : 'ENABLED '}  ${user.email}  ${user.displayName || ''}  uid=${user.uid}`,
      );
    next = page.pageToken;
  } while (next);
}
if (action === 'list') await list();
else if (action === 'add') {
  const name = (await ask('Display name: ')).slice(0, 24);
  if (!name) throw new Error('A display name is required.');
  const user = await auth.createUser({ email, password: await password(), displayName: name });
  await db.doc('allowedUsers/' + user.uid).set({ enabled: true, name });
  console.log(
    `Created ${account}. UID: ${user.uid}. Share the credentials privately; no site rebuild is needed.`,
  );
} else {
  const user = await auth.getUserByEmail(email);
  if (action === 'password') {
    await auth.updateUser(user.uid, { password: await password() });
    await auth.revokeRefreshTokens(user.uid);
    console.log('Password changed.');
  }
  if (action === 'rename') {
    const name = (await ask('New display name: ')).slice(0, 24);
    if (!name) throw new Error('A display name is required.');
    await auth.updateUser(user.uid, { displayName: name });
    await db.doc('allowedUsers/' + user.uid).set({ name }, { merge: true });
    console.log('Default display name updated. The player can also change their in-game name.');
  }
  if (action === 'disable' || action === 'enable') {
    const enabled = action === 'enable';
    await auth.updateUser(user.uid, { disabled: !enabled });
    await db.doc('allowedUsers/' + user.uid).set({ enabled }, { merge: true });
    if (!enabled) {
      await auth.revokeRefreshTokens(user.uid);
      await db.doc('meadow/' + user.uid).delete();
    }
    console.log(enabled ? 'Account enabled.' : 'Account disabled.');
  }
  if (action === 'remove') {
    if (
      (await ask(`This deletes ${account}'s account AND cloud progress. Type DELETE ${account}: `)) !==
      `DELETE ${account}`
    )
      throw new Error('Cancelled.');
    await db.doc('allowedUsers/' + user.uid).set({ enabled: false }, { merge: true });
    await auth.deleteUser(user.uid);
    const rooms = await db.collection('rooms').where('hostUid', '==', user.uid).get();
    const batch = db.batch();
    for (const collection of ['allowedUsers', 'players', 'meadow', 'invitations'])
      batch.delete(db.doc(collection + '/' + user.uid));
    for (const room of rooms.docs) batch.delete(room.ref);
    await batch.commit();
    console.log('Account and cloud progress removed.');
  }
}
