/* Ponyhaven integration, GPL-2.0-or-later. Included once by each engine's d_main.c. */
#include "m_argv.h"
#include "m_misc.h"
#include "i_system.h"
UINT32 ph_rings[MAXPLAYERS] = {0};
static void PH_Tick(void)
{
    static tic_t last = 0;
    static boolean finished = false, shot = false;
    const char *file, *session;
    char temporary[1200];
    FILE *fp;
    player_t *p;
    unsigned connected = 0, pi;
    if (gamestate != GS_LEVEL || consoleplayer < 0 || consoleplayer >= MAXPLAYERS) return;
    p = &players[consoleplayer];
    for (pi = 0; pi < MAXPLAYERS; ++pi) if (playeringame[pi]) ++connected;
    if (p->exiting && !finished) { finished = true; }
    if (M_CheckParm("-ph-test") && leveltime > 3*TICRATE && !shot) { M_ScreenShot(); shot = true; }
    if (M_CheckParm("-ph-test") && leveltime > 5*TICRATE) I_Quit();
    if (!finished && gametic - last < 7) return;
    last = gametic;
    if (!M_CheckParm("-ph-progress") || !M_IsNextParm()) return;
    file = M_GetNextParm();
    if (!M_CheckParm("-ph-session") || !M_IsNextParm()) return;
    session = M_GetNextParm();
    if (strlen(file) > 1000 || strlen(session) != 36) return;
    snprintf(temporary,sizeof temporary,"%s.next",file);
    fp = fopen(temporary,"wb");
    if (!fp) return;
    fprintf(fp,"{\"session\":\"%s\",\"rings\":%u,\"score\":%u,\"map\":%u,\"elapsed\":%u,\"laps\":%u,\"players\":%u,\"finished\":%s}",
        session,(unsigned)ph_rings[consoleplayer],(unsigned)p->score,(unsigned)gamemap,
        (unsigned)p->realtime,(unsigned)p->laps,connected,finished ? "true" : "false");
    fclose(fp);
    remove(file);
    rename(temporary,file);
    /* Return to the MLP launcher before the engine's original story/intermission. */
    if (finished && connected <= 1) I_Quit();
}
