/* Ponyhaven native interface. GPL-2.0-or-later. */
#ifndef PONYHAVEN_UI_H
#define PONYHAVEN_UI_H
#ifdef PONYHAVEN_KART
#define PH_GAME_TITLE "PONYKART"
#define PH_UI_SKY 224
#define PH_UI_BORDER 201
#define PH_UI_PAPER 0
#define PH_UI_STAR 250
#else
#define PH_GAME_TITLE "PONYHAVEN ADVENTURE"
#define PH_UI_SKY 144
#define PH_UI_BORDER 160
#define PH_UI_PAPER 1
#define PH_UI_STAR 194
#endif

static void PH_DrawPanel(const char *heading, const char *line1,
    const char *line2, const char *action)
{
    INT32 x;
    V_DrawFill(0,0,320,200,PH_UI_SKY);
    V_DrawFill(20,20,280,160,PH_UI_BORDER);
    V_DrawFill(23,23,274,154,PH_UI_PAPER);
    for (x=40; x<300; x+=60) {
        V_DrawFill(x-1,32,3,9,PH_UI_STAR);
        V_DrawFill(x-4,35,9,3,PH_UI_STAR);
    }
    V_DrawCenteredString(160,52,V_PURPLEMAP,PH_GAME_TITLE);
    V_DrawCenteredString(160,78,V_PURPLEMAP,heading);
    V_DrawCenteredString(160,104,V_GRAYMAP,line1);
    V_DrawCenteredString(160,119,V_GRAYMAP,line2);
    V_DrawCenteredString(160,151,V_PURPLEMAP,action);
}
#endif
