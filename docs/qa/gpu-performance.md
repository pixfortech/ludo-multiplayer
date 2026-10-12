# Measuring the 3D board on a real GPU

The CI machines and the cloud development container have no GPU. There,
headless Chromium renders WebGL in software (SwiftShader, on the CPU), so the
performance numbers in [performance budgets](../design/performance-budgets.md)
compare views on one machine. They are not device frame rates. This page
explains how to collect the same measurements on a computer with a real GPU,
such as a Windows PC.

## What it measures

`npm run perf:gpu` runs `e2e/tests/board3d-performance.spec.ts` in your
installed Chrome (or Edge), in a visible window, on the real GPU. That is the
same test CI runs. It plays a live two-player game for each view:

- the 2D board;
- the classic 2.5D board (Low, Medium) and the 3D preview (Medium);
- Kolkata's living city in 2.5D (Low, Medium) and 3D (Medium).

For each view it records:

- the GPU and driver WebGL reports;
- the first drawn board after a reload;
- display frames a second while idle and while a token moves;
- the worst frame;
- main-thread busy time;
- the city's ambient state once settled;
- draw calls, triangles, GPU geometries and textures;
- the JS heap;
- the latency from a tap on a token to the move request leaving the page;
- in Kolkata, the time until the four characters (C.3A) have loaded, and the main-thread time their animation takes per frame.

## Running it on Windows

1. **Prerequisites.** You need what the browser tests need:
   - Node 24;
   - `npm ci` already run;
   - PostgreSQL 17 server binaries with `PG_BIN_DIR` set, as in the README's "Tests and PostgreSQL" section.

   The run uses a disposable database and never touches yours.
2. Install Google Chrome, or use Microsoft Edge.
3. Close other heavy applications. Plug in a laptop and use its high-performance power plan. On a dual-GPU laptop, optionally set Chrome to "High performance" under Windows Settings → System → Display → Graphics.
4. In PowerShell, from the repository root:

   ```powershell
   $env:PG_BIN_DIR = "C:\Program Files\PostgreSQL\17\bin"
   npm run perf:gpu                        # Chrome
   npm run perf:gpu -- --channel msedge    # or Microsoft Edge
   ```

   A browser window opens and plays a few games by itself, for about 4 minutes. Don't touch it or cover it while it runs. Hidden windows aren't drawn, and the city then rests.
5. **Results.** The console prints a summary table, and the full numbers are saved to `perf-results/gpu-<timestamp>.json`. That folder is git-ignored. The file holds only timings, counts and the GPU's name. Send it back for the report.

## Reading the results

- **Idle and move frame rates** follow the display's refresh rate (60 Hz, 120 Hz and so on) when the GPU keeps up. They're measured with `requestAnimationFrame`.
- **Ambient state:**
  - `live` means the city's traffic runs at its quality's rate (Low 12, Medium 20, High 30 a second);
  - `eased` means the device afforded less;
  - `resting` means the device couldn't afford the city's motion, so it stood still.
- **Tap to request** should stay within a few milliseconds on any device.
- **Bound to this run:** the numbers hold only for this machine, browser and driver. Run it twice to see the variance.

## Runs so far

| Date | Machine | What it established | What it did not |
| --- | --- | --- | --- |
| 2026-10 (after C.3A) | Windows, Intel graphics, Direct3D 11 (reported by the project owner) | Low and Medium ran on a real GPU. | **High and Ultra are not validated**: this test measures Low and Medium only. The run ended with internal test-runner errors, so its summary is incomplete; the result file was not shared, so no numbers from it are recorded here. |

What follows from it:

- Low and Medium stay the supported levels; High stays available as a target, with no promise yet.
- No final graphics-quality claims are made until the comprehensive High/Ultra audit, which comes after the visual redesign (new assets and lighting).
- If the runner errors recur, send the console output with the JSON file: the test writes the JSON before it checks its budgets, so a budget failure still leaves the numbers.
- Since C.3B the test also measures a four-player Kolkata room (sixteen characters) and reports when the player's own team and when every character has loaded.
