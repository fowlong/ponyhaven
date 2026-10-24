# Desktop and mobile sync

For a single copy-and-paste text file with the full rules and Console settings, open [FIREBASE_CONSOLE_SETUP.txt](FIREBASE_CONSOLE_SETUP.txt).

Ponyhaven can share one profile between the Windows app and a mobile website on GitHub Pages. The phone has **Meadow, Magic Blocks, Little shop, and Collection**. Adventure and Ponykart stay in the desktop app. Your phone works while the desktop app is closed, including earning bits and pony XP in Magic Blocks.

Use one **Firebase Spark (no billing)** project, Email/Password Authentication, and Cloud Firestore. No private GitHub repository, server, Cloud Functions, paid storage, or Google sign-in is required. Both desktop and mobile use Firebase accounts you create for friends; no public registration is provided.

## 1. Create the free Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/), create a project, and leave Google Analytics off. Keep the **Spark** plan; do not add a billing account.
2. Under **Authentication → Sign-in method**, enable **Email/Password**. The app does not need passwordless email links or Google login.
3. Under **Firestore Database**, create the default database in **production mode**. Pick a convenient region, such as Sydney. Paste the entire contents of [firestore.rules](firestore.rules) into the Rules editor and publish them. Keep the default deny rules until you have done this.
4. Under **Project settings → General**, register a **Web app**. Copy these four public configuration values into a local `.env.local` file beside `package.json`:

   ```dotenv
   VITE_FIREBASE_API_KEY=your-web-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_APP_ID=your-web-app-id
   VITE_REQUIRE_AUTH=true
   ```

   These are public app identifiers, not Admin credentials. Never put a service-account JSON or an account password in these variables, the website, or GitHub.

   Recommended: in Firestore **Indexes → Single field → Add exemption**, use collection group `players`, field `save`, and disable ascending, descending and array indexes. Saves are read by account ID and never searched. This avoids indexing every card and pony. The same exemption is in `firestore.indexes.json` for CLI deployment with `firebase deploy --only firestore`.

## 2. Invite the first account

The simplest approach needs no Admin key:

1. In **Authentication → Users → Add user**, create `callanharris91@gmail.com` with a password you choose privately.
2. Copy that user's **UID**.
3. In Firestore, create collection `allowedUsers` and a document whose ID is exactly that UID. Add `enabled` as the boolean `true` and `name` as a string, for example `Callan`.
4. Repeat for each friend. Only the project owner/Admin SDK can change this invitation list. Creating an Auth user alone does not grant access to game data.

For repeated administration, [FIREBASE_SETUP.md](FIREBASE_SETUP.md) describes the local `npm run accounts -- add username` manager. It can add, rename, disable and remove accounts. Its Admin credential stays on your computer in the ignored `private/` folder. You do not need to commit credentials anywhere.

## 3. Connect a desktop profile

1. Build the desktop app with the same Firebase values: `npm run desktop:package`. During development, use `npm run desktop`.
2. Sign in with your invited Firebase account. A new installation creates and links your profile automatically.
3. For an existing unlinked local profile, open **Account and settings → Connect mobile sync** and enter the invited account to connect that save.
4. If the account has no cloud save, the current local profile uploads. If it already has a save, that save loads here and a local backup is kept first. A sync account can be linked to only one local profile in an installation.
5. Wait for **Cloud saved** before switching devices. This status also appears in settings and the page footer.

No licence key is required. Both clients use your invited Firebase account. Resetting progress keeps your account and sync link.

## 4. Publish the mobile companion

1. Create a GitHub repository for this source project. Keep `native/`, `tmp/`, `release/`, `.env.local`, `private/`, `node_modules/`, and account files out of the repository; `.gitignore` already excludes them.
2. Add four **repository Actions variables** with the same `VITE_FIREBASE_…` names and values from step 1. These public variables are compiled into both clients.
3. In **Settings → Pages**, choose **GitHub Actions** as the source. Push the source to the `main` branch. [The included workflow](.github/workflows/pages.yml) builds the phone companion with authentication required and publishes only `dist/`.
4. Add your `<owner>.github.io` domain under Firebase **Authentication → Settings → Authorized domains**. For local browser testing, add `localhost` and `127.0.0.1` if needed.
5. Open the Pages URL on your phone and sign in with the same invited account. You can add the page to your home screen using your browser's menu.

The local build does not create either service automatically. In the owner's Windows workspace, [Publish-Ponyhaven.cmd](Publish-Ponyhaven.cmd) can create `fowlong/ponyhaven`, copy the four public variables, and publish the companion; see [GITHUB_PUBLISHING.txt](GITHUB_PUBLISHING.txt).

## What syncs

Cards and duplicate counts, bits, unlocked pets and rarity variants, the chosen pet, care meters, dirt, every pony's levels, pending pack reveals, rewards, daily purchases/gifts, NPC timers, and your arcade records all share one save. The desktop keeps a local file as well.

Uploaded backgrounds, selected scenery, sound/motion preferences, and imported native level files stay on each device. Peer-to-peer desktop parties and the mobile Firebase meadow are separate multiplayer rooms; this companion syncs account progress, not desktop native-game sessions.

Both clients listen for cloud changes, including while the binder is open. A purchase is saved before its reveal animation. Prefer playing on one device at a time. If two devices change progress from the same revision, the second upload is rejected rather than silently replacing the first. The affected device displays **Load synced progress** and **Export device backup**. Loading the synced save keeps the competing device copy for recovery; it does not merge currency or duplicate purchases.

The configured desktop validates account access online at startup. If connectivity drops during play, it queues progress locally for the next connection. Phone offline cold-start and background uploads are not guaranteed; reconnect and wait for **Cloud saved** before closing the browser. No purchase requires real money.

## Costs and checks

As checked on 19 October 2026, [Firestore's no-cost allowance](https://firebase.google.com/docs/firestore/quotas) includes 1 GiB stored data, 50,000 reads and 20,000 writes daily, and 10 GiB outbound transfer monthly. The app batches save bursts; card art and sprites come from GitHub Pages, not Firestore. A few friends should fit comfortably with normal use, but check the Firebase Usage dashboard. Staying on Spark avoids automatic paid overages; exhausted quotas can pause sync until they reset. Local backups remain available.

Before sharing the build: link a desktop profile, buy a pack on a phone, verify its cards on desktop, close the desktop and play on the phone, then reopen desktop. Also try an uninvited account and confirm it cannot enter. The equivalent local emulator checks are implemented in `scripts/qa-sync.mjs` and `scripts/qa-cloud.mjs`; they do not verify your eventual production configuration.

Reference: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [Spark plan](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).
