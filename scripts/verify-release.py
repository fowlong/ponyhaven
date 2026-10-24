"""Verify every ZIP payload hash, source bundle, entry path and executable."""
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
archive = ROOT / "release/Ponyhaven-Windows.zip"
version = json.loads((ROOT / "package.json").read_text())["version"]
prefix = f"Ponyhaven-{version}-win32-x64/"
with zipfile.ZipFile(archive) as z:
    assert len(z.namelist()) == len(set(z.namelist())), "Duplicate ZIP paths"
    assert all(n.startswith(prefix) and ".." not in pathlib.PurePosixPath(n).parts
               and "\\" not in n for n in z.namelist()), "Unsafe archive path"
    manifest = z.read(prefix + "FILES.sha256").decode("utf8").splitlines()
    expected_names = {prefix + "FILES.sha256"}
    for line in manifest:
        expected, name = line.split("  ", 1)
        expected_names.add(prefix + name)
        with z.open(prefix + name) as file:
            assert hashlib.file_digest(file, "sha256").hexdigest() == expected, name
    assert set(z.namelist()) == expected_names, "Unmanifested ZIP content"
    metadata = json.loads(z.read(prefix + "build.json"))
    assert metadata["version"] == version
    for game in ("adventure", "ponykart"):
        shipped = z.read(prefix + f"resources/app/native/{game}/{game}.exe")
        digest = hashlib.sha256(shipped).hexdigest()
        assert digest == metadata["engines"][game]
        assert digest == hashlib.sha256((ROOT / "native" / game / (game + ".exe")).read_bytes()).hexdigest()
        assert digest != "826c9bb4e984bbe002ae09604294b9b5929b82214c5117bfba9aa3d2355b17de"
    assert z.read(prefix + "Ponyhaven.exe")[:2] == b"MZ"
    assert prefix + "engine-sources.zip" in expected_names
    assert json.loads(z.read(prefix + "resources/app/package.json"))["main"] == "desktop/main.mjs"
    for entry in ("desktop/games.mjs", "dist/index.html"):
        assert z.read(prefix + "resources/app/" + entry) == (ROOT / entry).read_bytes(), ("Stale package", entry)
    assert any("/dist/assets/index-" in n and n.endswith(".css") for n in expected_names)
    assert not any(n.endswith("/electron.exe") for n in expected_names)
with archive.open("rb") as f:
    checksum = hashlib.file_digest(f, "sha256").hexdigest()
assert (ROOT / "release/Ponyhaven-Windows.zip.sha256").read_text().split()[0] == checksum
print(f"Verified all {len(manifest)} payload hashes, safe ZIP paths, native binaries, app entry point and archive checksum.")
print(checksum)
