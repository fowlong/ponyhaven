"""Apply documented Ponyhaven changes to pristine, pinned engine sources."""
import pathlib,re,shutil
from importlib.util import spec_from_file_location,module_from_spec
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=spec_from_file_location('build',ROOT/'scripts/build-native.py');build=module_from_spec(spec);spec.loader.exec_module(build)

for game,source in build.SOURCES.items():
    def edit(file,fn):
        p=source/file
        backup=p.with_suffix(p.suffix+'.upstream')
        if not backup.exists():shutil.copy2(p,backup)
        changed=fn(backup.read_text(encoding='utf8'))
        if p.read_text(encoding='utf8')!=changed:p.write_text(changed,encoding='utf8')
    edit('src/byteptr.h',lambda t:t.replace('#ifdef __GNUC__','#if defined(__GNUC__) || defined(__clang__)'))
    shutil.copy2(ROOT/'engines/ponyhaven_bridge.h',source/'src/ponyhaven_bridge.h')
    shutil.copy2(ROOT/'engines/ponyhaven_pastel.h',source/'src/ponyhaven_pastel.h')
    if game=='adventure':
        def textures(t):
            t=t.replace('#include "dehacked.h"','#include "dehacked.h"\n#include "ponyhaven_pastel.h"')
            t=t.replace('done:\n\t// Now that the texture', 'done:\n\tPH_PastelPixels(blocktex, total_pixels);\n\t// Now that the texture',1)
            t=t.replace('Z_SetUser(texture->flat, &texture->flat);','PH_PastelPixels(texture->flat, texture->width * texture->height);\n\t\tZ_SetUser(texture->flat, &texture->flat);',1)
            return t
        edit('src/r_textures.c',textures)
    else:
        def textures(t):
            t=t.replace('#include "dehacked.h"','#include "dehacked.h"\n#include "ponyhaven_pastel.h"')
            t=t.replace('done:\n\t// Now that the texture','''done:
    if (texture->holes) {
        /* Shared column offsets occur in compressed patches. Translate each
           post once, on this private copy, without touching its source lump. */
        UINT8 *seen = calloc(blocksize, 1);
        if (seen) {
            for (x = 0; x < texture->width; ++x) {
                size_t offset = LONG(texturecolumnofs[texnum][x]) - 3;
                while (offset + 4 < blocksize && block[offset] != 255 && !seen[offset]) {
                    size_t length = block[offset + 1];
                    seen[offset] = 1;
                    if (offset + length + 4 > blocksize) break;
                    PH_PastelPixels(block + offset + 3, length);
                    offset += length + 4;
                }
            }
            free(seen);
        }
    } else PH_PastelPixels(blocktex, texture->width * texture->height);
    // Now that the texture''',1)
            t=t.replace('return W_CacheLumpNum(flatlumpnum, PU_CACHE);','''typedef struct ph_flat_s { lumpnum_t id; UINT8 *pixels; struct ph_flat_s *next; } ph_flat_t;
    static ph_flat_t *first = NULL;
    ph_flat_t *entry;
    for (entry = first; entry && entry->id != flatlumpnum; entry = entry->next) {}
    if (!entry) {
        entry = calloc(1, sizeof *entry); entry->id = flatlumpnum;
        entry->next = first; first = entry;
    }
    if (!entry->pixels) {
        size_t size = W_LumpLength(flatlumpnum);
        entry->pixels = Z_Malloc(size, PU_STATIC, &entry->pixels);
        W_ReadLump(flatlumpnum, entry->pixels);
        PH_PastelPixels(entry->pixels, size);
    }
    return entry->pixels;''',1)
            return t
        edit('src/r_data.c',textures)
        edit('src/r_plane.c',lambda t:t.replace('W_CacheLumpNum(levelflats[pl->picnum].lumpnum,\n\t\t\tPU_STATIC)', 'R_GetFlat(levelflats[pl->picnum].lumpnum)'))
    def main(t):
        # Hash checking for stock data is replaced by the distribution's manifest.
        # Network addon checks remain unchanged.
        t=re.sub(r'W_VerifyFileMD5\([^;]+\);','/* Ponyhaven uses curated base data. */',t)
        t=t.replace('void D_SRB2Loop(void)',' #include "ponyhaven_bridge.h"\n\nvoid D_SRB2Loop(void)')
        t=t.replace('TryRunTics(realtics);','TryRunTics(realtics);\n            PH_Tick();')
        return t
    edit('src/d_main.c',main)
    title='Ponyhaven Adventure' if game=='adventure' else 'Ponykart'
    edit('src/sdl/i_video.c',lambda t:t.replace('SDL_SetWindowTitle(window, title);',f'SDL_SetWindowTitle(window, "{title}");'))
    # The launcher owns character/level/settings choices. The native pause menu
    # deliberately exposes only resume/exit, with no original branding.
    def menu(t):
        t=t.replace('boolean M_Responder(event_t *ev)\n{','''boolean M_Responder(event_t *ev)
{
    if (menuactive) {
        if (ev->type == ev_keydown) {
            if (ev->data1 == KEY_ESCAPE || ev->data1 == KEY_ENTER) M_ClearMenus(true);
            else if (ev->data1 == 'q') I_Quit();
        }
        return true;
    }
''')
        t=t.replace('void M_Drawer(void)\n{',f'''void M_Drawer(void)
{{
    if (menuactive) {{
        V_DrawFadeScreen(0xFF00, 20);
        V_DrawString(80,60,V_YELLOWMAP,"{title.upper()}");
        V_DrawString(48,88,0,"A LITTLE PAUSE WITH FRIENDS");
        V_DrawString(48,112,0,"ENTER / ESC     KEEP PLAYING");
        V_DrawString(48,132,0,"Q               BACK TO MEADOW");
        return;
    }}
    return;
''')
        if game=='adventure': t=t.replace('ev->data1','ev->key')
        return t
    edit('src/m_menu.c',menu)
    def intermission(t):
        # Keep a shared game open until friends have finished; do not advance
        # into an unselected course or show the original story/results art.
        t=t.replace('void Y_Ticker(void)\n{','void Y_Ticker(void)\n{\n    if (M_CheckParm("-ph-progress")) return;\n')
        t=t.replace('void Y_Drawer(void)\n{',f'''void Y_Drawer(void)
{{
    if (M_CheckParm("-ph-progress")) {{
        V_DrawFill(0,0,320,200,31);
        V_DrawString(80,50,V_YELLOWMAP,"{title.upper()}");
        V_DrawString(60,85,0,"A LOVELY LITTLE FINISH!");
        V_DrawString(38,110,0,"YOUR BITS HAVE BEEN SAVED.");
        V_DrawString(30,145,0,"ESC THEN Q TO RETURN TO MEADOW");
        return;
    }}
''')
        return t.replace('#include "doomdef.h"','#include "doomdef.h"\n#include "m_argv.h"',1)
    edit('src/y_inter.c',intermission)
    if game=='ponykart':
        # Direct network launches can load a sky before the first video-mode
        # change. Initialize both aliases together, including later resizes.
        edit('src/screen.c',lambda t:t.replace('walldrawerfunc = R_DrawWallColumn_8;', 'wallcolfunc = walldrawerfunc = R_DrawWallColumn_8;'))
        def waiting(t):
            # Pony addons need not provide the stock character's waiting poses.
            t=t.replace('void F_StartWaitingPlayers(void)\n{','void F_StartWaitingPlayers(void)\n{\n\twipegamestate = GS_TITLESCREEN; finalecount = 0; return;\n')
            return t.replace('void F_WaitingPlayersDrawer(void)\n{','''void F_WaitingPlayersDrawer(void)
{
    V_DrawFill(0,0,BASEVIDWIDTH,BASEVIDHEIGHT,31);
    V_DrawString(120,60,V_YELLOWMAP,"PONYKART");
    V_DrawString(48,100,0,"GETTING YOUR FRIENDS TOGETHER");
    V_DrawString(64,128,0,"THE NEXT RACE IS ON ITS WAY");
    return;
''')
        edit('src/f_finale.c',waiting)
        edit('src/p_setup.c',lambda t:t.replace('if (!demo.playback && multiplayer && !dedicated)', 'if (!demo.playback && multiplayer && !dedicated && !M_CheckParm("-ph-progress"))'))
        def diagnostics(t):
            t=t.replace('#include <signal.h>', '#include <signal.h>\n#include <windows.h>\n#include <dbghelp.h>\n#include <excpt.h>')
            return t.replace('D_QuitNetGame(); // Fix server freezes', '''{
            EXCEPTION_POINTERS *error=(EXCEPTION_POINTERS *)_pxcptinfoptrs;
            char storage[sizeof(SYMBOL_INFO)+256]; SYMBOL_INFO *symbol=(SYMBOL_INFO *)storage;
            SymInitialize(GetCurrentProcess(), NULL, TRUE);
            symbol->SizeOfStruct=sizeof(SYMBOL_INFO); symbol->MaxNameLen=255;
            if(error) {
                DWORD64 offset=0;
                DWORD *stack=(DWORD *)(uintptr_t)error->ContextRecord->Esp; unsigned i;
                IMAGEHLP_LINE64 line={0};DWORD displacement=0;line.SizeOfStruct=sizeof(line);
                I_OutputMsg("Ponyhaven fault %08x at %p\\n",(unsigned)error->ExceptionRecord->ExceptionCode,error->ExceptionRecord->ExceptionAddress);
                if(SymFromAddr(GetCurrentProcess(),(DWORD64)(uintptr_t)error->ExceptionRecord->ExceptionAddress,&offset,symbol))
                    I_OutputMsg("Ponyhaven function: %s + %u\\n",symbol->Name,(unsigned)offset);
                for(i=0;i<20;i++) if(SymFromAddr(GetCurrentProcess(),(DWORD64)stack[i],&offset,symbol))
                    I_OutputMsg("Ponyhaven caller[%u]: %s + %u\\n",i,symbol->Name,(unsigned)offset);
                if(SymGetLineFromAddr64(GetCurrentProcess(),(DWORD64)stack[0]-1,&displacement,&line))
                    I_OutputMsg("Ponyhaven source: %s:%u\\n",line.FileName,(unsigned)line.LineNumber);
            }
        }
        D_QuitNetGame(); // Fix server freezes''')
        edit('src/sdl/i_system.c',diagnostics)
        edit('src/blua/luaconf.h',lambda t:t.replace('#include <limits.h>','#include <limits.h>\n#ifdef _WIN32\n#include <windows.h>\n#undef LoadString\n#endif'))
        edit('src/sdl/i_main.c',lambda t:t.replace('ExcHndlInit();','/* Optional Dr. MinGW exception handler is not linked in this build. */'))
    if game=='adventure':
        edit('src/r_things.c',lambda t:t.replace('boolean is_player = mobj->skin && mobj->sprite == SPR_PLAY;', 'boolean is_player = mobj->skin && mobj->sprite == SPR_PLAY;\n\t/* The supplied pony art already carries its character colours. */\n\tif (is_player && !mobj->colorized) return NULL;'))
        def rings(t):
            t=t.replace('P_GivePlayerRings(player, 1);', '''P_GivePlayerRings(player, 1);
            if (special->type != MT_FLINGRING && special->type != MT_FLINGCOIN) {
                extern UINT32 ph_rings[MAXPLAYERS];
                ph_rings[player - players]++;
            }''',1)
            return t
        edit('src/p_inter.c',rings)
        edit('src/p_enemy.c',lambda t:t.replace('P_GivePlayerRings(player, actor->info->reactiontime);','''P_GivePlayerRings(player, actor->info->reactiontime);
    { extern UINT32 ph_rings[MAXPLAYERS]; if (actor->info->reactiontime > 0) ph_rings[player - players] += actor->info->reactiontime; }'''))
    print('Patched',game)
