"""Apply documented Ponyhaven changes to pristine, pinned engine sources."""
import pathlib,re,shutil
from importlib.util import spec_from_file_location,module_from_spec
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=spec_from_file_location('build',ROOT/'scripts/build-native.py');build=module_from_spec(spec);spec.loader.exec_module(build)

def prepend_function(text, signature, body):
    pattern=re.compile(r'^'+re.escape(signature)+r'\s*\{',re.M)
    if len(pattern.findall(text))!=1:
        raise RuntimeError('Expected exactly one native function: '+signature)
    return pattern.sub(lambda m:m[0]+'\n'+body+'\n',text,count=1)

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
    for header in ['ponyhaven_ui.h','ponyhaven_ui_test.h']:
        shutil.copy2(ROOT/'engines'/header,source/'src'/header)
    edit('src/sdl/SDL_icon.xpm',lambda t:(ROOT/'engines/ponyhaven_icon.xpm').read_text())
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
        frontend='''#include "ponyhaven_ui.h"
static void PH_DrawFrontend(void)
{
    if (gamestate == GS_INTERMISSION)
        PH_DrawPanel("A LOVELY LITTLE FINISH", "YOUR BITS HAVE BEEN SAVED.", "SEE YOU BACK IN THE MEADOW.", "ESC / Q   RETURN TO MEADOW");
    else if (gamestate == GS_WAITINGPLAYERS)
        PH_DrawPanel("GETTING FRIENDS TOGETHER", "YOUR NEXT GAME IS ON ITS WAY.", "WAITING FOR YOUR PARTY...", "ESC / Q   RETURN TO MEADOW");
    else
        PH_DrawPanel("A LITTLE MAGIC AWAITS", "CHOOSE YOUR PONY AND COURSE", "IN THE PONYHAVEN APP.", "ESC / Q   RETURN TO MEADOW");
}
#include "ponyhaven_ui_test.h"

'''
        marker='static void D_Display(void)'
        if t.count(marker)!=1 or t.count('I_UpdateNoBlit();')!=1:raise RuntimeError('Native display entry changed: '+game)
        t=t.replace(marker,frontend+'extern void I_PHReadyFrame(void);\n\n'+marker,1)
        # One central guard also covers less common states and future menu paths.
        t=t.replace('I_UpdateNoBlit();','''I_UpdateNoBlit();
    I_PHReadyFrame(); /* Loading is complete; the next presented frame can be shown. */
    if (PH_DrawUIAudit()) { I_FinishUpdate(); return; }
    if (gamestate != GS_LEVEL) { PH_DrawFrontend(); I_FinishUpdate(); return; }
''',1)
        return t
    edit('src/d_main.c',main)
    title='Ponyhaven Adventure' if game=='adventure' else 'Ponykart'
    def video(t):
        # The tiny startup console is rendered by SDL in the game window.
        # Keep it hidden through loading and reveal only a rendered game frame.
        t=t.replace('static SDL_bool Impl_CreateWindow(SDL_bool fullscreen);','''static boolean ph_frame_ready = false, ph_window_shown = false;
void I_PHReadyFrame(void) { ph_frame_ready = true; }
static SDL_bool Impl_CreateWindow(SDL_bool fullscreen);''',1)
        t=t.replace('static SDL_bool Impl_CreateWindow(SDL_bool fullscreen)\n{\n\tint flags = 0;',
                    'static SDL_bool Impl_CreateWindow(SDL_bool fullscreen)\n{\n\tint flags = SDL_WINDOW_HIDDEN;\n\tph_window_shown = false;',1)
        t=t.replace('SDL_SetWindowTitle(window, title);',f'SDL_SetWindowTitle(window, "{title}");')
        t=re.sub(r'SDL_CreateWindow\("SRB2(?:Kart)? "VERSIONSTRING,',f'SDL_CreateWindow("{title}",',t)
        t=t.replace('realwidth, realheight, flags);','''realwidth, realheight, flags);
    if (window) I_OutputMsg("Ponyhaven startup window hidden: %d\\n",
        (SDL_GetWindowFlags(window) & SDL_WINDOW_HIDDEN) != 0);''',1)
        t=t.replace('\texposevideo = SDL_FALSE;','''    if (ph_frame_ready && !ph_window_shown && window) {
        SDL_ShowWindow(window);
        SDL_RaiseWindow(window);
        ph_window_shown = true;
    }
    exposevideo = SDL_FALSE;''',1)
        helper='''INT32 I_PHWindowVisible(void)
{
    SDL_SysWMinfo info;
    if (!window) return 0;
    SDL_VERSION(&info.version);
    if (SDL_GetWindowWMInfo(window, &info) && info.subsystem == SDL_SYSWM_WINDOWS)
        return IsWindowVisible(info.info.win.window) ? 1 : 0;
    return -1; /* The headless SDL test driver has no Windows window. */
}

'''
        return t.replace('void I_ShutdownGraphics(void)',helper+'void I_ShutdownGraphics(void)',1)
    edit('src/sdl/i_video.c',video)
    # The launcher owns character/level/settings choices. The native pause menu
    # deliberately exposes only resume/exit, with no original branding.
    def menu(t):
        t=t.replace('boolean M_Responder(event_t *ev)','#include "ponyhaven_ui.h"\n\nboolean M_Responder(event_t *ev)',1)
        t=prepend_function(t,'boolean M_Responder(event_t *ev)','''
    if (gamestate != GS_LEVEL) {
        if (ev->type == ev_keydown && (ev->data1 == KEY_ESCAPE || ev->data1 == 'q')) I_Quit();
        return true;
    }
    if (menuactive) {
        if (ev->type == ev_keydown) {
            if (ev->data1 == KEY_ESCAPE || ev->data1 == KEY_ENTER) M_ClearMenus(true);
            else if (ev->data1 == 'q') I_Quit();
        }
        return true;
    }
    if (ev->type == ev_keydown && ev->data1 == KEY_ESCAPE) {
        M_StartControlPanel(); return true;
    }
    return false;
''')
        t=prepend_function(t,'void M_Drawer(void)','''
    if (menuactive)
        PH_DrawPanel("A LITTLE PAUSE", "ENTER / ESC   KEEP PLAYING", "YOUR PONY WILL WAIT HERE.", "Q   RETURN TO MEADOW");
    return;
''')
        if game=='adventure': t=t.replace('ev->data1','ev->key')
        return t
    edit('src/m_menu.c',menu)
    def intermission(t):
        # Keep a shared game open until friends have finished; do not advance
        # into an unselected course or show the original story/results art.
        t=prepend_function(t,'void Y_Ticker(void)','    if (M_CheckParm("-ph-progress-stdio")) return;')
        t=t.replace('void Y_IntermissionDrawer(void)','#include "ponyhaven_ui.h"\n\nvoid Y_IntermissionDrawer(void)',1)
        t=prepend_function(t,'void Y_IntermissionDrawer(void)','''
    PH_DrawPanel("A LOVELY LITTLE FINISH", "YOUR BITS HAVE BEEN SAVED.", "SEE YOU BACK IN THE MEADOW.", "ESC / Q   RETURN TO MEADOW");
    return;
''')
        if game=='ponykart':
            t=prepend_function(t,'void Y_VoteDrawer(void)','''
    PH_DrawPanel("YOUR NEXT FRIENDLY RACE", "CHOOSE A COURSE IN PONYHAVEN.", "YOUR PARTY CAN JOIN THERE.", "ESC / Q   RETURN TO MEADOW");
    return;
''')
            t=prepend_function(t,'void Y_VoteTicker(void)','    if (M_CheckParm("-ph-progress-stdio")) return;')
        return t.replace('#include "doomdef.h"','#include "doomdef.h"\n#include "m_argv.h"',1)
    edit('src/y_inter.c',intermission)
    def finale(t):
        t=t.replace('void F_IntroDrawer(void)','#include "ponyhaven_ui.h"\n\nvoid F_IntroDrawer(void)',1)
        for function in ['F_IntroDrawer','F_TitleScreenDrawer','F_CreditDrawer','F_GameEvaluationDrawer','F_GameEndDrawer','F_ContinueDrawer','F_CutsceneDrawer','F_WaitingPlayersDrawer']+(['F_EndingDrawer'] if game=='adventure' else []):
            t=prepend_function(t,'void '+function+'(void)','''
    PH_DrawPanel("A LITTLE MAGIC AWAITS", "CHOOSE YOUR PONY AND COURSE", "IN THE PONYHAVEN APP.", "ESC / Q   RETURN TO MEADOW");
    return;
''')
        t=prepend_function(t,'void F_TitleScreenTicker(boolean run)','    (void)run; return; /* No stock title demos or title-map playback. */')
        if game=='ponykart':
            t=prepend_function(t,'void F_StartWaitingPlayers(void)','    wipegamestate = GS_TITLESCREEN; finalecount = 0; return;')
        return t
    edit('src/f_finale.c',finale)
    if game=='ponykart':
        # Direct network launches can load a sky before the first video-mode
        # change. Initialize both aliases together, including later resizes.
        edit('src/screen.c',lambda t:t.replace('walldrawerfunc = R_DrawWallColumn_8;', 'wallcolfunc = walldrawerfunc = R_DrawWallColumn_8;'))
        edit('src/p_setup.c',lambda t:t.replace('if (!demo.playback && multiplayer && !dedicated)', 'if (!demo.playback && multiplayer && !dedicated && !M_CheckParm("-ph-progress-stdio"))'))
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
        def level_title(t):
            start=t.index('void ST_drawTitleCard(void)\n{')
            end=t.index('\nluahook:',start)
            return t[:start]+'''void ST_drawTitleCard(void)
{
    const char *name = mapheaderinfo[gamemap-1]->lvlttl;
    if (!LUA_HudEnabled(hud_stagetitle) || lt_ticker >= (lt_endtime + TICRATE))
        goto luahook;
    if ((lt_ticker-lt_lasttic) > 1) lt_ticker = lt_lasttic+1;
    /* Keep the original title-card clock and slide, with just the level name. */
    V_DrawCenteredString(BASEVIDWIDTH/2 - FixedInt(lt_scroll), 80,
        V_PERPLAYER|V_ALLOWLOWERCASE|V_ROSYMAP, name);
    lt_lasttic = lt_ticker;
'''+t[end:]
        edit('src/st_stuff.c',level_title)
        # Write the ordinary engine log straight into the selected profile.
        # Upstream Windows wrote latest-log.txt beside the executable and copied
        # it at shutdown, which also races when separate profiles run together.
        edit('src/sdl/i_main.c',lambda t:t.replace('logstream = fopen("latest-log.txt", "wt+");','logstream = fopen(logfilename, "wt");'))
        edit('src/sdl/i_system.c',lambda t:t.replace('\t\tShittylogcopy();','\t\t/* The log is already in the profile directory. */'))
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
