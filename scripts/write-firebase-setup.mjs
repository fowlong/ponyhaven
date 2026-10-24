import fs from 'node:fs/promises';

// Keep the copy-and-paste guide's rules identical to the tested source file.
const rules = (await fs.readFile(new URL('../firestore.rules', import.meta.url), 'utf8')).trim();
const text = `PONYHAVEN - FIREBASE CONSOLE SETUP
=================================

This file contains the complete rules to paste, the settings to select, and
the four public app values to copy. Firebase Console needs a few clicks;
there is no single script to paste there that creates everything.
Do not paste this whole file into the Rules editor or browser DevTools.

1. CREATE THE PROJECT AND SERVICES
----------------------------------
Open https://console.firebase.google.com/ and create a project.
Keep the free Spark plan. Google Analytics can be off.

Build > Authentication > Get started > Sign-in method:
  Enable Email/Password and save.
  Leave the optional email-link/passwordless setting off.

Build > Firestore Database > Create database:
  Use Standard edition, the default database (database ID: (default)),
  and production mode. Choose your preferred region, e.g. Sydney.
  Use Cloud Firestore, not Realtime Database.

2. PASTE AND PUBLISH THE FIRESTORE RULES
----------------------------------------
Open Firestore Database > Rules.
Replace the editor contents with ONLY the code between the markers below,
starting with rules_version and ending with the final closing brace.
Click Publish. These rules allow invited accounts to save their own progress
and use shared meadows. Players cannot edit the invitation list.

----- BEGIN RULES (do not copy this marker) -----
${rules}
----- END RULES (do not copy this marker) -----

3. ADD YOUR FIRST ACCOUNT
--------------------------
Authentication > Users > Add user:
  Email: callanharris91@gmail.com
  Password: choose a private password in Firebase Console.

Copy the new user's UID from Authentication. This is an ID, not the email.

Firestore Database > Data > Start collection:
  Collection ID: allowedUsers
  Document ID:   PASTE_THE_EXACT_AUTHENTICATION_UID_HERE

Add these fields using the Console's field editor:

  Field       Type       Value
  enabled     boolean    true
  name        string     Callan

Click Save. Do not use an auto-generated document ID, and do not make true
a string. The conceptual document is:

  allowedUsers/YOUR_AUTH_UID
  { "enabled": true, "name": "Callan" }

The Console field editor does not need this JSON pasted into it.
Repeat for each friend with their own Auth user, UID and name.
To revoke access, set enabled to boolean false and disable their Auth user.
No passwords or Admin credentials belong in Firestore.
The app creates players, rooms, meadow and invitations documents itself;
you do not need to create empty collections for them.

4. EXEMPT THE SAVE FROM SEARCH INDEXING
---------------------------------------
Firestore Database > Indexes > Single field > Add exemption:
  Collection ID / collection group: players
  Field path: save
  Query scope: Collection (if prompted)

Disable Ascending, Descending and Array contains indexing for this field,
then save. Saves are loaded by user ID, never searched by card contents.
No composite indexes are required. The same settings are already stored
in this project's firestore.indexes.json.

5. REGISTER THE WEB APP AND COPY THE PUBLIC CONFIG
--------------------------------------------------
Project settings > General > Your apps > Add app > Web (the </> icon).
Choose a name, e.g. Ponyhaven. Firebase Hosting is not required.
The SDK configuration contains apiKey, authDomain, projectId and appId.
Copy those four values into the matching lines below.

Create .env.local beside package.json in the Ponyhaven project folder.
Paste these lines into that file, replacing every REPLACE_ value:

VITE_FIREBASE_API_KEY=REPLACE_WITH_apiKey
VITE_FIREBASE_AUTH_DOMAIN=REPLACE_WITH_authDomain
VITE_FIREBASE_PROJECT_ID=REPLACE_WITH_projectId
VITE_FIREBASE_APP_ID=REPLACE_WITH_appId
VITE_REQUIRE_AUTH=true

These four Web app identifiers are public. Do not use service-account JSON,
Admin credentials or account passwords in this file.
Keep .env.local out of Git; the project already ignores it.
Do not set VITE_COMPANION=true in the desktop .env.local.

After saving .env.local, rebuild the Windows app from a terminal in the
project folder:

  npm run desktop:package

Launch the rebuilt Ponyhaven.exe and sign in with the invited Firebase account.
New installations create and link a local profile automatically. For an existing
unlinked save, use Account and settings > Connect mobile sync. Existing local progress uploads on first link
if the account has no cloud save. If it has one, the cloud save loads and
the current device copy is backed up first.

6. CONNECT GITHUB PAGES
------------------------
In the GitHub source repository, open Settings > Secrets and variables >
Actions > Variables. Add four repository variables with these exact names
and the same four values used above:

  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_APP_ID

GitHub Settings > Pages > Build and deployment > Source: GitHub Actions.
The included Pages workflow enables the mobile companion and required login.
Push the source to main, or rerun the workflow after updating variables.

Firebase Authentication > Settings > Authorized domains > Add domain:
  YOUR_GITHUB_USERNAME.github.io

Use the hostname only: no https:// and no repository path.
Add your custom hostname too if you later use one. For local browser testing,
add localhost and 127.0.0.1 if they are not already authorized.

Open the resulting Pages URL and sign in with the invited Firebase account.
The phone's Meadow, Magic Blocks, Little shop and Collection work while desktop is closed.
Desktop and mobile both use Firebase login; no licence key is required.

7. QUICK CHECK
----------------
Wait for Cloud saved before switching devices. Buy a pack on the phone,
then open Collection on desktop and check the new cards. Close desktop,
play on the phone, and reopen desktop to confirm the latest progress loads.
If both devices changed the same save offline, use Load synced progress;
Export device backup preserves the competing device copy for recovery.

If login says the account is not invited, compare the Auth UID with the
allowedUsers document ID and check that enabled is the boolean true.
If sync says insufficient permissions, confirm the rules were published,
the invitation exists, and both builds use the same Firebase project.

OPTIONAL: DEPLOY RULES AND INDEXES WITH A LOCAL TERMINAL
-------------------------------------------------------
These commands are an alternative to steps 2 and 4 only. Run them in a
PowerShell terminal in the Ponyhaven project folder, not Firebase Console.
They publish the project's existing rules and indexes to the project you
explicitly name. Replace YOUR_PROJECT_ID before running:

  npx firebase-tools login
  npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID

Authentication settings and invited users still need the earlier steps.
For an optional local account manager, see FIREBASE_SETUP.md.
For sync behavior and the full walkthrough, see MOBILE_SYNC_SETUP.md.

Official references:
https://firebase.google.com/docs/rules/manage-deploy
https://firebase.google.com/docs/auth/web/password-auth
https://firebase.google.com/docs/firestore/query-data/indexing
`;

await fs.writeFile(new URL('../FIREBASE_CONSOLE_SETUP.txt', import.meta.url), text.replace(/\r?\n/g, '\r\n'));
console.log('Wrote FIREBASE_CONSOLE_SETUP.txt with the current tested Firestore rules.');
