# Phase 2E — backend QA report

The authoritative multiplayer backend (Phases 2A–2D) was checked on Linux and Windows. Nothing in the game rules or the classic board geometry was changed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `fresh/ludo-rebuild` and every pull request:

| | |
| --- | --- |
| Platforms | `ubuntu-latest`, `windows-latest` (`fail-fast: false`, so both always report) |
| Runtime | Node.js 24 (`actions/setup-node@v5`, npm cache) |
| Database | PostgreSQL 17 binaries. Linux: PGDG apt. Windows: the image's PostgreSQL if it is 17, else Chocolatey. Checked by `scripts/ci/check-postgres.mjs 17`. |
| Steps | `npm ci` → typecheck → lint → build → `npm run test` → compiled-server tests (`LUDO_E2E_COMPILED=1`: startup, two-client, restart) |
| Strictness | `REQUIRE_POSTGRES_TESTS=1`, and `scripts/ci/run-checked.mjs` fails a step on any skipped or todo test, harness skip banner, unhandled error/rejection or test time-out, even if the command exited 0 |
| Isolation | Every database test uses a throwaway cluster that the harness creates in `RUNNER_TEMP` and deletes afterwards. No secrets or external databases are involved; `DATABASE_URL` and `TEST_DATABASE_URL` are blank. |
| Permissions | `contents: read`, `persist-credentials: false`, no `secrets.*`; repository tests check all three |

## Coverage of the QA areas

| Area | How it is verified |
| --- | --- |
| 1. Complete gameplay, 2/3/4 players | `socket/__tests__/fullGames.pg.test.ts`: real clients play every seat to game over (winner-only and full ranking), with seeded dice injected at the service. Checks the final state on every client and in the database, `game:finished`, finishing places, and one event per action. |
| 2. Synchronisation under concurrency | `__tests__/load.pg.test.ts`: 20 rooms and 40 clients at once. Every client gets every version exactly once and in order, and all converge with PostgreSQL. |
| 3. Durability and restart recovery | Process-crash test (`postgresStore.test.ts`); real server-process restart, source and compiled (`restart.e2e.pg.test.ts`) |
| 4. Duplicate actions and races | Duplicates and conflicts in `realtime.pg.test.ts`; 25 simultaneous identical requests execute once (load test); cross-process arbitration (`gameplayService.pg.test.ts`) |
| 5. Reconnect and credential security | `sessions.pg.test.ts` (resume, revocation, two-step rotation, forged and invalid credentials) |
| 6. Automatic pause/resume | `sessions.pg.test.ts` (manual grace clock) and the restart test (real timer) |
| 7. Multi-tab identity isolation | `sessions.pg.test.ts` (in-use, takeover, separate players in tabs, simultaneous resumes) |
| 8. Socket.IO event ordering | Ordered versions and sequences in the load, full-game and convergence tests |
| 9. Performance and load | Load and full-game tests print the measurements below |
| 10. Storage and connection pools | Pool usage after load and after 100 reconnect cycles; snapshot sizes per game |
| 11. Production security configuration | Review below; config and header tests in `httpServer.test.ts` |
| 12. Windows and Linux | CI matrix |

## Bugs found and fixed

| # | Problem | Fix | Regression test |
| --- | --- | --- | --- |
| 1 | **A connection that closed while its seat was being claimed kept the seat.** The disconnect handler ran before the claim had bound the socket, and the claim then bound the dead socket. The seat looked controlled forever, so the game never paused for that player and reconnects were refused as `session-in-use`. | The claim refuses a closed connection before and after the database hand-over. Releases are serialised with claims per player. Control only counts for a live socket. | `sessions.pg.test.ts`, "…closed while it was being claimed (regression)": fails before the fix, passes after |
| 2 | **Production could start with the development client origin.** Without `CLIENT_ORIGIN`, Socket.IO allowed `http://localhost:5173`; a `*` or a URL with a path was accepted. | With `NODE_ENV=production`, explicit https origins are required. Wildcards and non-origins are refused everywhere. | `httpServer.test.ts` |
| 3 | **Every commit read its whole snapshot back.** `RETURNING *` re-parsed and re-validated about 150 KB late in a 4-player game. | Return the small columns and the already-validated state | Full-game and store tests; about 10% less time per action in long games |
| 4 | **Windows CI timed out (5 s) in a store test.** Test clusters were on the runner's C: drive, and each commit waits for a WAL flush. | CI uses `RUNNER_TEMP` (a faster disk) for temporary files; `fsync` stays on | Windows CI |
| 5 | **The CI runner flagged a passing test.** Its name mentions "unhandled errors" and Windows printed it because it was slow. | Patterns anchored to Vitest's report formats | `scripts/checks/ciRunner.test.ts` |

## Performance measurements

In-process server, loopback sockets, private PostgreSQL cluster with `fsync` on. "CI" columns are GitHub-hosted runners (PostgreSQL 17, Node 24); "dev" is the development container (PostgreSQL 16, Node 22).

| Scenario | CI Linux | CI Windows | dev |
| --- | --- | --- | --- |
| 20 rooms / 40 clients, 600 actions at once: throughput | 603/s | 273/s | 326/s |
| …acknowledgement latency p50 / p95 / p99 / max | 28 / 69 / 89 / 93 ms | 68 / 111 / 174 / 188 ms | 57 / 82 / 104 / 119 ms |
| …pool at the end | 10 total, 0 waiting | 10 total, 0 waiting | 10 total, 0 waiting |
| 100 resume/close cycles | 5.8 ms per cycle | 5.7 ms per cycle | 11.5 ms per cycle |
| 25 identical requests at once | 1 executed | 1 executed | 1 executed |

Complete games (time per action, CI Linux / CI Windows / dev):

| Game | Actions | History entries | Final snapshot | Time per action |
| --- | --- | --- | --- | --- |
| 2-player, winner only | 294 | 528 | 53 KB | 5.9 / 7.7 / 10.1 ms |
| 3-player, full ranking | 498 | 980 | 100 KB | 6.4 / 7.8 / 12.4 ms |
| 4-player, full ranking | 794 | 1,502 | 153 KB | 4.6 / 6.3 / 14.4 ms |
| 4-player, winner only | 549 | 1,102 | 111 KB | 3.5 / 5.0 / 12.8 ms |

Run times: the server suite takes 17.6 s on CI Linux and 31.8 s on CI Windows; a whole CI job takes about 1 min (Linux) or 2 min (Windows).

Serialising and validating a 1,500-entry state costs about 2 ms of CPU. The rest of each action is about ten database round trips plus writing the snapshot.

## Security review

| Topic | Status |
| --- | --- |
| Dependencies | `npm audit`: 0 vulnerabilities (production and development) |
| SQL | Every value is a bound parameter. The only interpolated SQL fragments are compile-time constants (column names from a fixed map, fixed clauses). |
| Credentials | 256-bit secrets; only SHA-256 digests stored; constant-time comparison; two-step rotation; revoked on leave. Tests check that no secret appears in any broadcast, log line or table. |
| Identity | Comes only from the verified connection (session epoch checked against PostgreSQL); identity fields in payloads are refused. |
| Input | Payloads must be plain objects of at most 4 KiB with strict fields. Frames over 16 KiB are dropped by Socket.IO. Rate limits apply per connection, per player, to code guessing, to room creation and to failed handshakes. |
| Transport | CORS restricted to configured origins (https and required in production; no wildcards). Credentials go in the handshake `auth`, never in the URL. TLS terminates at the proxy (documented). `TRUST_PROXY_HOPS` must be set for proxied deployments. |
| HTTP | `x-powered-by` off; `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, same-origin resource policy, `no-store`; Socket.IO client script not served |
| Errors and logs | Unexpected errors become `internal-error` with an incident id. Logs are redacted (connection strings, passwords). |
| Database | The schema is checked at startup (refuses pending, edited or unknown migrations); `statement_timeout` 10 s; pool error listener |

## Remaining risks

- **Snapshot growth:** the stored snapshot contains the whole history, so each commit writes O(history). A long 4-player game ends at about 150 KB per write; over the whole game that is roughly O(n²) bytes of row versions (compressed by TOAST, then reclaimed by autovacuum). A future change could keep history only in `game_events` and drop it from the snapshot. That changes the persisted state shape, so it needs a decision.
- **Single instance:** presence, seat control in memory, grace timers, rate limits and the startup presence reset all assume one server process. Correctness doesn't: the session epoch and PostgreSQL arbitrate every action. Running several instances needs:
  - shared presence and rate limits;
  - a Socket.IO adapter;
  - one instance in charge of timers and the retention sweep.
- **Tested scale:** 40 concurrent clients on one process and one 10-connection pool. Larger-scale load (hundreds of rooms, real network latency) has not been measured.
- **Undecided:**
  - forfeit rules (option list in `docs/architecture/sessions.md`);
  - automatic transfer from a long-absent host;
  - purging archived rooms.
- **Supply chain:** actions are pinned to major-version tags, not commit SHAs (SHA pinning is recommended once the workflow settles).
- **Windows:** CI covers `windows-latest`; final confirmation on the project owner's Windows 11 machine is pending.
