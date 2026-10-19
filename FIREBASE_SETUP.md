# Ponyhaven: accounts and shared meadow setup

For desktop-to-phone progress sync, start with [MOBILE_SYNC_SETUP.md](MOBILE_SYNC_SETUP.md), or use the complete [Console copy-and-paste text file](FIREBASE_CONSOLE_SETUP.txt). This document also covers the optional local account administration tool and the browser's shared meadows. Desktop invite parties use PeerJS separately.

Ponyhaven’s website stays on **GitHub Pages**. Firebase supplies the small amount of infrastructure a static site cannot supply: password sign-in, private saved progress, an online friend list, invitations, and shared meadow codes. Friends do **not** need Google accounts.

Use the **Spark plan** and leave billing unlinked. This game uses Authentication and Firestore; it does not need Cloud Functions, Cloud Storage, a server, or a paid hosting plan. Spark includes no-cost allowances; if a quota is exhausted, the affected service pauses instead of charging an unlinked billing account. See [Firebase pricing](https://firebase.google.com/pricing).

The game currently works locally without this setup. Real account sign-in and cross-device shared meadows need the project below. This implementation uses Firestore for small shared-state updates, rather than introducing a separate peer-to-peer signalling service.

## 1. Create your free project

1. Open the [Firebase console](https://console.firebase.google.com/).
2. Create a project, for example `Ponyhaven Friends`. Analytics is optional; the game does not use it.
3. Keep the project on **Spark**. Do not enable billing or upgrade to Blaze.
4. In **Project settings → General**, register a **Web app**. You do not need Firebase Hosting.
5. Keep its web configuration handy. You need `apiKey`, `authDomain`, `projectId`, and `appId`.

These four web identifiers are meant to be in browser code. They are different from an Admin service-account key, which must stay private.

## 2. Turn on password accounts

1. Open **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**. Email-link sign-in and Google sign-in are not needed.
3. Under Authentication’s **Settings → Authorized domains**, add your Pages domain, such as `fowlong.github.io`. Add `localhost` if you will test accounts locally.

The game has a sign-in form, and deliberately has no account-registration form. Firestore also requires an owner-created allowlist entry, so a manually created but uninvited Auth account cannot read game data. Password authentication uses Firebase’s [supported web authentication flow](https://firebase.google.com/docs/auth/web/password-auth).

## 3. Create Firestore and install the rules

1. Open **Build → Firestore Database → Create database**.
2. Choose the default database and **Standard edition**, where offered. Pick a nearby location, such as Sydney when available.
3. Start in **Production mode**.
4. In the **Rules** tab, replace the editor contents with the complete contents of [`firestore.rules`](firestore.rules).
5. Click **Publish**.

The rules keep each player's save private, allow invited players to see online pony presence, let only a room's host change its background, and prevent browser clients from editing the account allowlist. Publish these rules before testing with friends. Do not switch the database into public test mode.

## 4. Create your first account

You can do this entirely through the Firebase console:

1. In **Authentication → Users**, choose **Add user**.
2. Enter an email and a password you choose. This does not require that person to sign in through Google.
3. For a simple username login, use `callan@ponyhaven.example`. The game translates the username `callan` to that address. You can instead use your real email and sign in with the full address.
4. Copy the new user’s **UID** from the Users table.
5. In Firestore’s **Data** tab, create collection `allowedUsers`.
6. Create a document whose **Document ID is the UID**, not the email or username.
7. Add these fields:

| Field | Type | Value |
| --- | --- | --- |
| `enabled` | boolean | `true` |
| `name` | string | `Callan` |

Repeat for each friend, using a different account and UID. Share their credentials privately. No passwords or account allowlist need to go in your GitHub repository.

The `.example` username addresses do not receive email. You manage password changes yourself using the local manager below. Real email addresses can also be used.

## 5. Connect the local game

Copy `.env.example` to `.env.local` in the project folder and fill in the four values from your Firebase web app:

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_REQUIRE_AUTH=true
```

Run `npm install`, then `npm run dev`. Restart the dev server after changing `.env.local`. Open the displayed local address and sign in. `.env.local` is ignored by Git.

Your earlier local preview is separate from your account save. To transfer it, export it in the local game's Settings first, then import that JSON while signed in. If you already connected Firebase, temporarily use an unconfigured local preview to reach the older local save. Importing first keeps a device backup of the previous account save.

## 6. Publish through GitHub Pages

1. Create an empty GitHub repository, for example `ponyhaven`. Public repositories support Pages on GitHub Free; see [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
2. Upload this project using GitHub Desktop or Git. Include `src`, `public`, `scripts`, `tests`, the package files, and `.github`. Do not upload `node_modules`, `tmp`, `private`, or local credential files.
3. Under **Repository Settings → Secrets and variables → Actions → Variables**, create the four variables below. Use the same web configuration values as above:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

4. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
5. Push to the `main` branch, or run **Publish Ponyhaven to GitHub Pages** in the Actions tab.
6. Open the Pages address shown by the deployment, normally `https://fowlong.github.io/ponyhaven/` if those are your account and repository names.

The workflow refuses to publish without the account configuration. Only the built `dist` folder becomes the website; the local account manager and private credentials are not part of it. The app supports a repository subfolder URL.

## 7. Optional: use the local account manager

This avoids repeatedly using the console. It runs on **your computer**, never in the browser. It uses the official [Firebase Admin user-management API](https://firebase.google.com/docs/auth/admin/manage-users).

1. In **Project settings → Service accounts → Firebase Admin SDK**, generate a private service-account key.
2. Make a folder called `private` inside this project. Save the downloaded JSON there as `firebase-admin.local.json`.
3. Keep that file on your computer. The entire `private` folder is ignored by Git; do not move this key into `public` or put it in a `VITE_` variable.
4. In a terminal in this project, run:

```powershell
npm run accounts -- add friend1
```

The manager asks for a display name and a password, with password typing hidden. It creates both the Auth user and `allowedUsers` entry. Nothing needs to be pushed to GitHub when an account changes.

```powershell
npm run accounts -- list
npm run accounts -- password friend1
npm run accounts -- rename friend1
npm run accounts -- disable friend1
npm run accounts -- enable friend1
npm run accounts -- remove friend1
```

`disable` preserves their progress. `remove` deletes the account and its cloud progress, and requires a typed confirmation. You can use an email address instead of a username. The manager never saves plaintext passwords in a local file.

## 8. Try a shared meadow

1. Sign into two different invited accounts in different browsers or on different devices.
2. Choose a starter pony in each account.
3. In the meadow, open **Our shared meadow**.
4. One person chooses **Host a meadow** and shares the eight-character code. The other person enters the code and selects **Join**.
5. Alternatively, select an online friend and choose **Invite selected friend**. They accept the invitation in the game.
6. The host can change backgrounds with the arrows, switch day/night, or upload a custom background. Visitors see the host’s choice. Shared custom images are compressed into the room document, so Firebase Storage is unnecessary.
7. Stay near each other to earn a little friendship and pony XP. NPC playdates also earn these bonuses when nearby.

Presence updates approximately every 20 seconds; offline ponies disappear after about a minute. Room codes expire after eight hours and invitations after five minutes. **Close this meadow** ends a hosted room for everyone. An NPC visit is separate: it lasts 20 minutes and can be invited once per hour.

## Recovery and checks

- **Account cannot enter:** verify its UID document exists in `allowedUsers` and `enabled` is a boolean `true`. Check that the rules were published.
- **Invalid login:** use the exact username or email you created. Change the password with the manager if needed.
- **Changes on two devices:** the game detects conflicting save revisions and asks the older device to reload. A local backup is kept rather than silently overwriting progress.
- **Offline:** progress stays in the browser and retries the cloud connection. Export a backup before clearing browser data.
- **Reset:** Settings → **Start this account again** clears its progress after typing `RESET`; it keeps the login and a local backup.
- **Quota:** monitor Firestore’s Usage tab. The game batches save writes and uses small presence updates. Keep billing unlinked to stay within the free plan.
- **First live verification:** check that an uninvited account is refused, two accounts retain separate collections, a guest cannot change the host's view, and a closed room disappears for its visitor. These checks need your actual project configuration.
