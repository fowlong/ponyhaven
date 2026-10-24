# Native build review — updated 21 October 2026

Version 0.2.5 retains the audited 0.2.3 Adventure and Ponykart executables; the
Cloud Rock 2 and Ponykart controls corrections change only launcher settings. The user
reported successful testing without new Malwarebytes warnings and authorized
continuing. No exclusions, protection changes or restoration of the quarantined
executable were used.

## Original detection

Malwarebytes reported Malware.Ransom.Agent.Generic at 19:02 Sydney time on
20 October for Adventure SHA-256
826c9bb4e984bbe002ae09604294b9b5929b82214c5117bfba9aa3d2355b17de.
Report ID: 8bece60c-cc5c-11f1-97a2-1c697a9f9d33. That hash matched the earlier
compiler output. It is not the executable included in this release.
Malwarebytes has not independently confirmed that detection as a false positive.
The report itself does not establish that other files were encrypted.

## Changes and verification

- The integration sends progress through an inherited stdout pipe. It no longer
  deletes/replaces a progress file five times a second. Repeated replacement was
  a possible trigger, not a proven cause of the alert.
- The receiver validates session identity, permitted fields, number bounds and
  message size. The launcher owns reward and profile writes.
- scripts/audit-native.py verifies all four pinned source/runtime archive hashes,
  compares 2,234 Adventure and 1,892 Kart source/library files to those archives,
  checks each permitted modification and original backup, verifies added headers,
  and compares shipped executables with the actual compiler outputs.
- Native DLLs match the upstream Windows release sets. Verified, unused older
  Adventure mixer DLLs were retired from the runtime folder.
- The Electron archive matches the installed package's checksum; all 73 extracted
  runtime files match that archive.
- Scoped execution checks use disposable profiles and real progress traffic.
  The reviewed integration contains no file-encryption, ransom, persistence or
  arbitrary-directory traversal logic. The 45-second-per-game regression left
  native runtime contents and unrelated test documents unchanged.
- Both new executables pass windowed and fullscreen launch checks. The latest
  local Malwarebytes anti-ransomware log checked during this build contained only
  the original 19:02 event.

The release includes build.json with executable hashes and FILES.sha256 for its
contents. The ZIP is CRC-checked before replacing the previous ZIP; its SHA-256
is recorded beside it.

## Limits

These source/provenance and scoped behavior checks are not an independent
malware-free certification. A Defender custom scan was unavailable because
Defender's scan feature is disabled on this Malwarebytes-managed installation.
The compiler, every compiled instruction and every execution path were not
independently audited. No vendor sample submission was made.

The Electron UI smoke test is separately limited by the agent's restricted
Windows token and the runtime's icudtl.dat access check. Renderer tests use
Chrome with the actual desktop modules. The production Electron sandbox remains
enabled.
