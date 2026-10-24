/* Ponyhaven integration, GPL-2.0-or-later. Included once by each engine's d_main.c. */
#include "m_argv.h"
#include "m_misc.h"
#include "i_system.h"
UINT32 ph_rings[MAXPLAYERS] = {0};
extern INT32 I_PHWindowVisible(void);
static void PH_Tick(void)
{
    static tic_t last = 0;
    static boolean finished = false, shot = false;
    static boolean windowReported = false;
    const char *session;
    player_t *p;
    unsigned connected = 0, pi;
    if (gamestate != GS_LEVEL || consoleplayer < 0 || consoleplayer >= MAXPLAYERS) return;
    /* Do not announce "started" while the SDL loading window is still hidden. */
    if (I_PHWindowVisible() == 0) return;
    if (!windowReported) {
        I_OutputMsg("Ponyhaven native window visible: %d\n", I_PHWindowVisible());
        windowReported = true;
    }
    p = &players[consoleplayer];
    for (pi = 0; pi < MAXPLAYERS; ++pi) if (playeringame[pi]) ++connected;
    if (p->exiting && !finished) { finished = true; }
    if (M_CheckParm("-ph-test") && leveltime > (M_CheckParm("-ph-title-test") ? TICRATE/2 : 3*TICRATE) && !shot) { M_ScreenShot(); shot = true; }
    if (M_CheckParm("-ph-test") && leveltime > 5*TICRATE) I_Quit();
    if (!finished && gametic - last < 7) return;
    last = gametic;
    if (!M_CheckParm("-ph-progress-stdio")) return;
    if (!M_CheckParm("-ph-session") || !M_IsNextParm()) return;
    session = M_GetNextParm();
    if (strlen(session) != 36 || strspn(session,"0123456789abcdef-") != 36) return;
    /* The launcher owns the inherited stdout pipe. No progress files, directory
       scans, encryption, deletion or replacement are needed by this bridge. */
    fprintf(stdout,"PONYHAVEN_PROGRESS {\"session\":\"%s\",\"rings\":%u,\"score\":%u,\"map\":%u,\"elapsed\":%u,\"laps\":%u,\"players\":%u,\"finished\":%s}\n",
        session,(unsigned)ph_rings[consoleplayer],(unsigned)p->score,(unsigned)gamemap,
        (unsigned)p->realtime,(unsigned)p->laps,connected,finished ? "true" : "false");
    fflush(stdout);
    /* Return to the MLP launcher before the engine's original story/intermission. */
    if (finished && connected <= 1) I_Quit();
}
