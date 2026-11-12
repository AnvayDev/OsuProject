# Capture requests for the real client (gameplay and settings)

What I need from the real osu! 2026.1005.0-lazer client, in the order I will use it. Put files in `docs/reference/real/` (stills) and
`docs/reference/recordings/real/` (videos); any names are fine, I will index them. Nothing here blocks the work that is already under way
(the measurement harness and the rules/scoring port), but items 1 to 3 are needed before I can verify playfield visuals.

Conditions for everything below, so the captures are comparable with the existing ones and with my renders:

- Same window as before: 1440x900 window on the built-in display, default "argon" skin, default settings unless stated.
- Beatmap: **Soleily - Renatus**, difficulty **[Insane]** by Gamu (beatmap set 241526; search "Renatus" in the beatmap listing).
- Stills as PNG if possible (JPEG blurs one-pixel borders and glows).
- Recordings at 60 fps, with system audio if your recorder supports it (audio lets me check hit-sound timing and A/V sync).

## 1. Config files (2 minutes, most valuable)

`~/Library/Application Support/osu/game.ini` and `framework.ini`. They tell me every setting you have changed (audio offset, background
dim, cursor size, frame limiter, HUD visibility, hit lighting, and so on), so the port can start from your values and I do not have to ask
about them one by one. Paste the contents or commit the files under `docs/reference/real/config/`.

## 2. Autoplay recording (the main visual reference)

Song select → mod select → enable **Autoplay** → play Renatus [Insane] from the start. Record from the click on the play button until
about 0:50 into the song. This gives me, with deterministic input: the player loader, the intro and skip overlay, approach circles,
hit circles, sliders (snaking, ball, follow circle, ticks, repeats), follow points, judgements, hit lighting, combo and score counters,
health bar and song progress.

## 3. Autoplay stills (paused replay frames)

In the same autoplay run, press **Space** to pause the replay (not Escape: the pause menu covers the screen) and use **,** and **.** to step
frames. Capture:

1. Several hit circles on screen with approach circles, combo numbers and follow points.
2. A slider just after it appears (body still snaking in).
3. A slider being followed (ball, follow circle, a tick and a reverse arrow visible if possible).
4. The frame right after a hit (judgement text and hit explosion visible).
5. The first spinner, mid-spin (at about 2:20 of the map; Right arrow seeks forward).
6. The break at about 2:02 to 2:20 (letterbox bars, break info, arrows).

## 4. Your own play (for hit-error parity and for miss and fail visuals)

1. Recording: play Renatus [Insane] (or an easier difficulty of the set if you prefer) normally for about a minute, including a few
   deliberate misses and a combo break, then let it run to the results screen and keep recording until the results animation finishes.
2. Still: the results screen, and the statistics panel (click the score panel to expand it). I need the hit-error numbers shown there
   (average hit error, unstable rate) from two or three plays: these are the baseline for hit-error parity.
3. Recording: fail on purpose (stop clicking) until the fail overlay appears, wait two seconds, press retry.
4. Recording: pause mid-play (Escape), then Continue, including the "click the cursor to resume" step.

## 5. Settings overlay

1. Stills: every section scrolled through from top to bottom (General, Skin, Input, User Interface, Gameplay, Audio, Graphics, Online,
   Maintenance, Debug), enough overlapping screenshots to cover every item. In Input, also the key-binding panel (click "Configure")
   and the mouse and tablet sub-sections.
2. Recording: open settings, hover the sidebar until it expands, scroll, open a dropdown, drag a slider, toggle a checkbox, type "offset"
   in the search box, click a "revert to default" arrow.

## 6. Later (not needed yet)

- Mod select with the customisation panel open (Difficulty Adjust selected).
- A replay being watched from the results screen, with the replay settings overlay (Ctrl+H).
- Player loader with a long disclaimer (a map with an epilepsy warning), if you have one.

## Benchmark from your machine

Once I push the benchmark page I will ask you to open `bench.html` on your dev URL in Chrome, press "Run all", and paste the JSON it
copies to the clipboard. It records refresh rate, renderer timings for the candidate designs, input event delays and audio latency as
Chrome reports them on your Mac (including the Bluetooth output latency).
