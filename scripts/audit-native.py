"""Verify native build inputs and bundled binaries against pinned local archives."""
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
report = {"archives": {}, "sources": {}, "runtimes": {}, "electron": {}}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def filehash(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


for item in json.loads((ROOT / "engines/downloads.json").read_text()):
    actual = filehash(ROOT / "tmp/arcade" / item["file"])
    assert actual == item["sha256"], ("archive checksum", item["file"])
    report["archives"][item["file"]] = actual

common = {"src/byteptr.h", "src/d_main.c", "src/f_finale.c", "src/m_menu.c",
          "src/sdl/SDL_icon.xpm", "src/sdl/i_video.c", "src/y_inter.c"}
cases = {
    "adventure": ("srb2-native-source.zip", "srb2-native-source/SRB2-SRB2_release_2.2.15",
                  common | {"src/p_enemy.c", "src/p_inter.c", "src/r_textures.c",
                            "src/r_things.c", "src/st_stuff.c", "src/sdl/i_main.c", "src/sdl/i_system.c"}),
    "ponykart": ("kart-native-source.zip", "kart-native-source/Kart-Public-1.6",
                 common | {"src/blua/luaconf.h", "src/p_setup.c", "src/r_data.c",
                           "src/r_plane.c", "src/screen.c", "src/sdl/i_main.c",
                           "src/sdl/i_system.c"}),
}
for game, (archive, folder, permitted) in cases.items():
    source = ROOT / "tmp/arcade" / folder
    original, changed = set(), []
    with zipfile.ZipFile(ROOT / "tmp/arcade" / archive) as z:
        for entry in z.infolist():
            name = entry.filename.partition("/")[2]
            if entry.is_dir() or not name.startswith(("src/", "libs/")):
                continue
            original.add(name)
            local = source / name
            expected = digest(z.read(entry))
            assert local.is_file(), ("missing source", game, name)
            if filehash(local) != expected:
                assert name in permitted, ("unexpected source modification", game, name)
                assert filehash(pathlib.Path(str(local) + ".upstream")) == expected
                changed.append(name)
    additions = {"src/" + p.name for p in (ROOT / "engines").glob("ponyhaven_*.h")}
    revision="SRB2_release_2.2.15" if game=="adventure" else "v1.6"
    expected_metadata=('const char* compbranch = "Ponyhaven";\n'
                       f'const char* comprevision = "{revision}";\n'
                       'const char* compnote = "Ponyhaven native build";\n')
    assert (source/"src/comptime.h").read_text() == expected_metadata
    for subfolder in ("src", "libs"):
        for local in (source / subfolder).rglob("*"):
            if not local.is_file() or local.suffix not in (".c", ".h", ".cpp"):
                continue
            name = local.relative_to(source).as_posix()
            assert name in original | additions | {"src/comptime.h"}, ("unexpected extra source", game, name)
            if name in additions:
                assert filehash(local) == filehash(ROOT / "engines" / local.name)
    report["sources"][game] = {"filesCompared": len(original), "modified": sorted(changed)}
    release = ROOT / "tmp/arcade" / ("srb2-windows" if game == "adventure" else "kart-windows")
    dependencies = {}
    for dll in (ROOT / "native" / game).glob("*.dll"):
        expected = release / dll.name
        assert expected.is_file() and filehash(dll) == filehash(expected), ("DLL mismatch", game, dll.name)
        dependencies[dll.name] = filehash(dll)
    binary = ROOT / "native" / game / (game + ".exe")
    output = ROOT / "tmp/native-build-022" / game / "out-clang/Release" / binary.name
    assert filehash(binary) == filehash(output), ("compiler output mismatch", game)
    report["runtimes"][game] = {"sha256": filehash(binary), "dlls": dependencies}

version = json.loads((ROOT / "node_modules/electron/package.json").read_text())["version"]
checksums = json.loads((ROOT / "node_modules/electron/checksums.json").read_text())
electron_zip = ROOT / "tmp/arcade/electron.zip"
expected = checksums[f"electron-v{version}-win32-x64.zip"]
assert filehash(electron_zip) == expected, "Electron archive does not match its package checksum"
with zipfile.ZipFile(electron_zip) as z:
    checked = 0
    for entry in z.infolist():
        if entry.is_dir():
            continue
        local = ROOT / "node_modules/electron/dist" / entry.filename
        assert filehash(local) == digest(z.read(entry)), ("Electron runtime mismatch", entry.filename)
        checked += 1
report["electron"] = {"version": version, "archiveSHA256": expected, "filesCompared": checked}
dest = ROOT / "tmp/native-input-audit.json"
dest.write_text(json.dumps(report, indent=2))
print("Pinned archives, source changes, added headers, native DLLs, compiler outputs, and Electron runtime verified.")
print(dest)
