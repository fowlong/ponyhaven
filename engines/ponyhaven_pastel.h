/* Ponyhaven world texture treatment, GPL-2.0-or-later.
 * Applied ONLY to private texture/flat caches, never sprite lumps, the shared
 * PLAYPAL, lighting tables, or HUD graphics. New maps use the same cache path.
 */
#include "m_argv.h"
#include "v_video.h"
static UINT8 ph_pastel[256];
static boolean ph_pastel_ready = false;
static void PH_PastelPixels(UINT8 *pixels, size_t count)
{
    size_t n;
    if (!ph_pastel_ready) {
        int strength = 55, i;
        if (M_CheckParm("-ph-pastel") && M_IsNextParm()) strength = atoi(M_GetNextParm());
        if (strength < 0) strength = 0;
        if (strength > 100) strength = 100;
        for (i = 0; i < 256; ++i) {
            double r = pLocalPalette[i].s.red, g = pLocalPalette[i].s.green, b = pLocalPalette[i].s.blue;
            double grey = (r*0.2126 + g*0.7152 + b*0.0722);
            double soften = strength * 0.0030, lift = strength * 0.0035;
            r += (grey-r)*soften; g += (grey-g)*soften; b += (grey-b)*soften;
            r += (255-r)*lift; g += (248-g)*lift; b += (253-b)*lift;
            if (!strength) ph_pastel[i] = (UINT8)i;
            else {
                int j, best = 0; double distance = 1e20;
                for (j = 0; j < 256; ++j) {
                    double dr, dg, db, candidate;
                    if (j == 247) continue; /* Never create a transparency hole. */
                    dr = r - pLocalPalette[j].s.red;
                    dg = g - pLocalPalette[j].s.green;
                    db = b - pLocalPalette[j].s.blue;
                    candidate = dr*dr + dg*dg + db*db;
                    if (candidate < distance) { distance = candidate; best = j; }
                }
                ph_pastel[i] = (UINT8)best;
            }
        }
        /* 247 is the legacy texture transparency sentinel. */
        ph_pastel[247] = 247;
        ph_pastel_ready = true;
    }
    for (n = 0; n < count; ++n) pixels[n] = ph_pastel[pixels[n]];
}
