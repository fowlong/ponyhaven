/* Optional native render regression; no effect without the explicit test flag. */
static boolean PH_DrawUIAudit(void)
{
    static unsigned frames = 0;
    const char *screen;
    if (!M_CheckParm("-ph-ui-test") || !M_IsNextParm()) return false;
    screen = M_GetNextParm();
    if (!strcmp(screen,"pause")) { menuactive = true; M_Drawer(); }
    else if (!strcmp(screen,"intro")) F_IntroDrawer();
    else if (!strcmp(screen,"title")) F_TitleScreenDrawer();
    else if (!strcmp(screen,"credits")) F_CreditDrawer();
    else if (!strcmp(screen,"ending")) F_GameEndDrawer();
    else if (!strcmp(screen,"evaluation")) F_GameEvaluationDrawer();
    else if (!strcmp(screen,"continue")) F_ContinueDrawer();
    else if (!strcmp(screen,"story")) F_CutsceneDrawer();
    else if (!strcmp(screen,"waiting")) F_WaitingPlayersDrawer();
    else if (!strcmp(screen,"results")) Y_IntermissionDrawer();
#ifdef PONYHAVEN_KART
    else if (!strcmp(screen,"vote")) Y_VoteDrawer();
#else
    else if (!strcmp(screen,"finale")) F_EndingDrawer();
#endif
    else PH_DrawFrontend();
    if (++frames == 3) M_ScreenShot();
    if (frames > 5) I_Quit();
    return true;
}
