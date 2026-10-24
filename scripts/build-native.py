"""Reproducible, local MSVC build of the two GPL engines; no system installation."""
import pathlib, re, subprocess, argparse, shutil, hashlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    'adventure': ROOT/'tmp/arcade/srb2-native-source/SRB2-SRB2_release_2.2.15',
    'ponykart': ROOT/'tmp/arcade/kart-native-source/Kart-Public-1.6',
}

def configure(game,clean=False,build_root='tmp/native-build'):
    src = SOURCES[game]
    revision='SRB2_release_2.2.15' if game=='adventure' else 'v1.6'
    # The upstream batch normally creates this. Keep standalone source builds
    # reproducible without a Git checkout or a separately run batch file.
    (src/'src/comptime.h').write_text(
        'const char* compbranch = "Ponyhaven";\n'
        f'const char* comprevision = "{revision}";\n'
        'const char* compnote = "Ponyhaven native build";\n')
    dest = (ROOT/build_root/game).resolve()
    if not dest.is_relative_to((ROOT/'tmp').resolve()):
        raise ValueError('Build output must stay inside this workspace tmp directory.')
    dest.mkdir(parents=True, exist_ok=True)
    # Recreate MSVC-compatible import libraries from the bundled DLL exports.
    # The old MinGW import archives do not carry SafeSEH metadata.
    toolsets=sorted(pathlib.Path(r'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC').iterdir())
    tools=toolsets[-1]/'bin/Hostx64/x86'
    runtime=ROOT/'tmp/arcade'/('srb2-windows' if game=='adventure' else 'kart-windows')
    for library in ['libcurl','exchndl','SDL2_mixer_ext','libgme']:
        dll=runtime/(library+'.dll')
        if not dll.exists():continue
        output=subprocess.check_output([str(tools/'dumpbin.exe'),'/exports',str(dll)],text=True)
        names=re.findall(r'^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+([\w@?]+)',output,re.M)
        definition=dest/(library+'.def');definition.write_text('LIBRARY '+library+'.dll\nEXPORTS\n'+'\n'.join(names))
        subprocess.run([str(tools/'lib.exe'),'/nologo','/machine:x86','/def:'+str(definition),'/out:'+str(dest/(library+'.lib'))],check=True,stdout=subprocess.DEVNULL)
    s = src.as_posix()
    mixer='"${CMAKE_CURRENT_SOURCE_DIR}/SDL2_mixer_ext.lib"' if game=='adventure' else '"${ENGINE}/libs/SDL2_mixer/lib/x86/SDL2_mixer.lib" "${CMAKE_CURRENT_SOURCE_DIR}/libgme.lib"'
    audio_definitions='HAVE_MIXERX' if game=='adventure' else 'HAVE_LIBGME PONYHAVEN_KART'
    # Source lists are taken from the matching upstream project, avoiding obsolete
    # Visual Studio project files which omit newer source files.
    if game == 'adventure':
        t = (src/'src/CMakeLists.txt').read_text()
        core = re.findall(r'^\s*([\w/]+\.c)\s*$', t.split('add_executable(SRB2SDL2')[1].split(')')[0], re.M)
        core += ['netcode/'+p.name for p in (src/'src/netcode').glob('*.c') if p.name!='i_addrinfo.c']
        core += ['filesrch.c','apng.c']
    else:
        t = (src/'src/CMakeLists.txt').read_text()
        core=[]
        for key in ['SRB2_CORE_SOURCES','SRB2_CORE_RENDER_SOURCES','SRB2_CORE_GAME_SOURCES','SRB2_PNG_SOURCES','SRB2_LUA_SOURCES']:
            m=re.search(r'set\('+key+r'\s+(.*?)\)',t,re.S)
            if m: core+=re.findall(r'[\w/]+\.c',m[1])
        core += ['http-mserv.c','sdl/i_cdmus.c']
    core += ['string.c']
    core += ['blua/'+p.name for p in (src/'src/blua').glob('*.c') if p.name not in ['lua.c','luac.c','print.c']]
    core += ['sdl/'+f+'.c' for f in ['i_main','i_net','i_system','i_video','i_threads','dosstr','endtxt','mixer_sound'] if (src/'src/sdl'/ (f+'.c')).exists()]
    core += ['win32/win_dbg.c']
    core = list(dict.fromkeys(core))
    missing = [p for p in core if not (src/'src'/p).exists()]
    if missing: raise RuntimeError(missing)
    (dest/'CMakeLists.txt').write_text(f'''cmake_minimum_required(VERSION 3.16)
project(PonyhavenEngine LANGUAGES C)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
set(ENGINE "{s}")
file(GLOB ZLIB_SOURCES "${{ENGINE}}/libs/zlib/*.c")
list(FILTER ZLIB_SOURCES EXCLUDE REGEX "(example|minigzip)\\\\.c$")
add_library(ph_zlib STATIC ${{ZLIB_SOURCES}})
target_include_directories(ph_zlib PUBLIC "${{ENGINE}}/libs/zlib")
file(GLOB PNG_SOURCES "${{ENGINE}}/libs/libpng-src/png*.c")
list(FILTER PNG_SOURCES EXCLUDE REGEX "pngtest\\\\.c$")
add_library(ph_png STATIC ${{PNG_SOURCES}})
target_include_directories(ph_png PUBLIC "${{ENGINE}}/libs/libpng-src")
target_link_libraries(ph_png PUBLIC ph_zlib)
add_executable({game} WIN32
''' + '\n'.join('"${ENGINE}/src/'+f+'"' for f in core) + f''')
target_include_directories({game} PRIVATE "${{ENGINE}}/src" "${{ENGINE}}/libs/SDL2/include" "${{ENGINE}}/libs/SDL2_mixer/include" "${{ENGINE}}/libs/SDLMixerX/i686-w64-mingw32/include/SDL2" "${{ENGINE}}/libs/gme/include" "${{ENGINE}}/libs/curl/include" "${{ENGINE}}/libs/drmingw/include")
target_compile_definitions({game} PRIVATE WIN32 NOHW _CRT_SECURE_NO_WARNINGS _CRT_NONSTDC_NO_DEPRECATE _WINSOCK_DEPRECATED_NO_WARNINGS HAVE_SDL HAVE_THREADS HAVE_BLUA HAVE_PNG HAVE_ZLIB HAVE_CURL HAVE_MIXER {audio_definitions} SOUND=SOUND_MIXER SDLMAIN DIRECTFULLSCREEN)
target_compile_options({game} PRIVATE /W0 /O2 /Z7 /Oy- /U_WINDOWS -Wno-error=implicit-function-declaration -Wno-error=incompatible-pointer-types)
target_link_options({game} PRIVATE /DEBUG /STACK:2097152)
target_link_libraries({game} PRIVATE dbghelp)
target_link_libraries({game} PRIVATE ph_png ph_zlib "${{ENGINE}}/libs/SDL2/lib/x86/SDL2.lib" "${{ENGINE}}/libs/SDL2/lib/x86/SDL2main.lib" {mixer} "${{CMAKE_CURRENT_SOURCE_DIR}}/libcurl.lib" ws2_32 winmm imm32 version ole32 oleaut32 uuid advapi32 shell32 gdi32 setupapi)
if(EXISTS "${{ENGINE}}/libs/drmingw/lib/win32/libexchndl.a")
target_link_libraries({game} PRIVATE "${{CMAKE_CURRENT_SOURCE_DIR}}/exchndl.lib")
endif()
''')
    subprocess.run(['cmake','-S',str(dest),'-B',str(dest/'out-clang'),'-G','Visual Studio 17 2022','-A','Win32','-T','ClangCL'],check=True)
    subprocess.run(['cmake','--build',str(dest/'out-clang'),'--config','Release','--parallel','8']+(['--clean-first'] if clean else []),check=True)
    target=ROOT/'native'/game
    target.mkdir(parents=True,exist_ok=True)
    shutil.copy2(dest/'out-clang/Release'/ (game+'.exe'),target/(game+'.exe'))
    shutil.copy2(dest/'out-clang/Release'/ (game+'.pdb'),target/(game+'.pdb'))
    # Use the release's tested DLL set, including its music decoders. Mixing the
    # SDK's older mixer binary with release data breaks native music playback.
    for dll in runtime.glob('*.dll'):shutil.copy2(dll,target/dll.name)
    if game=='adventure':
        # Earlier builds used the optional SDL_mixer SDK. The release uses
        # Mixer X instead. Retire only verified SDK leftovers from our output.
        superseded=['libFLAC-8.dll','libmodplug-1.dll','libmpg123-0.dll','libogg-0.dll',
                    'libopus-0.dll','libopusfile-0.dll','libvorbis-0.dll',
                    'libvorbisfile-3.dll','SDL2_mixer.dll']
        retired=ROOT/'tmp/retired-adventure-runtime-022'
        for name in superseded:
            old=target/name
            if not old.exists() or (runtime/name).exists():continue
            original=src/'libs/SDL2_mixer/lib/x86'/name
            if not original.exists() or hashlib.sha256(old.read_bytes()).digest()!=hashlib.sha256(original.read_bytes()).digest():
                raise RuntimeError('Unexpected leftover DLL; review before packaging: '+str(old))
            retired.mkdir(parents=True,exist_ok=True)
            shutil.copy2(old,retired/name)
            old.unlink()
    print('Built',target/(game+'.exe'))

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('game',choices=SOURCES);p.add_argument('--clean',action='store_true');p.add_argument('--build-root',default='tmp/native-build');args=p.parse_args();configure(args.game,args.clean,args.build_root)
