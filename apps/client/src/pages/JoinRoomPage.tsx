import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomPreview } from "@ludo/shared-types";
import { AUTO_COLOUR, ColourPicker } from "../components/game/ColourPicker";
import { MobileActionBar } from "../components/layout/MobileActionBar";
import { PlayerToken } from "../components/game/PlayerToken";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/Field";
import { ArrowLeftIcon, CrownIcon, EnterIcon, ResumeIcon } from "../components/ui/Icons";
import { Spinner } from "../components/ui/Spinner";
import { useToasts } from "../components/ui/Toasts";
import { errorCode, friendlyError } from "../lib/errors";
import { SEAT_CORNERS, formatRoomCode, isCompleteCode, normaliseCodeInput } from "../lib/format";
import { identityFor } from "../lib/identities";
import { rememberName, rememberedName } from "../lib/preferences";
import { Link, paths, useRouter } from "../lib/router";
import { useGame } from "../state/gameClient";

type PreviewState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; preview: RoomPreview } | { kind: "error"; message: string };

const BLOCKED: Record<NonNullable<RoomPreview["blockedReason"]>, string> = {
  "room-full": "This room is full.",
  "game-already-started": "This game has already started. Players already in it can resume from their own device.",
  "room-closed": "This room has closed.",
};

export function JoinRoomPage({ initialCode }: { initialCode: string | null }) {
  const { client, seats, tab } = useGame();
  const { navigate } = useRouter();
  const toasts = useToasts();
  const [code, setCode] = useState(initialCode ? normaliseCodeInput(initialCode) : "");
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [name, setName] = useState(rememberedName);
  const [colour, setColour] = useState<string>(AUTO_COLOUR);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const latestRequest = useRef(0);
  const savedSeats = isCompleteCode(code) ? seats.forRoom(code) : [];

  const loadPreview = useCallback(
    async (target: string) => {
      const request = ++latestRequest.current;
      setPreview({ kind: "loading" });
      try {
        const result = await client.previewRoom(target);
        if (request === latestRequest.current) setPreview({ kind: "ready", preview: result });
        return result;
      } catch (error) {
        if (request === latestRequest.current) setPreview({ kind: "error", message: friendlyError(error) });
        return null;
      }
    },
    [client],
  );

  useEffect(() => {
    if (!isCompleteCode(code)) {
      latestRequest.current++;
      setPreview({ kind: "idle" });
      return;
    }
    const timer = setTimeout(() => void loadPreview(code), 250);
    return () => clearTimeout(timer);
  }, [code, loadPreview]);

  // If the chosen colour is no longer free in the latest preview, fall back to Auto.
  useEffect(() => {
    if (preview.kind === "ready" && colour !== AUTO_COLOUR && preview.preview.colours.find((c) => c.colour === colour)?.taken) setColour(AUTO_COLOUR);
  }, [preview, colour]);

  const room = preview.kind === "ready" ? preview.preview : null;
  const codeError = code.length > 0 && code.length === 6 && !isCompleteCode(code) ? "Room codes use letters and the numbers 2–9 only." : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!room) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length < 1 || [...trimmed].length > 24) {
      setNameError("Choose a name of 1–24 characters.");
      return;
    }
    setNameError(null);
    setFormError(null);
    setJoining(true);
    try {
      const joined = await client.joinRoom({ code: room.code, displayName: trimmed, colour });
      rememberName(trimmed);
      seats.save({ roomCode: joined.room.code, playerId: joined.player.playerId, secret: joined.credential.secret, displayName: joined.player.displayName, roomName: joined.room.name });
      tab.set({ roomCode: joined.room.code, playerId: joined.player.playerId });
      toasts.push({ tone: "success", title: `Joined ${joined.room.name ?? formatRoomCode(joined.room.code)}`, body: `You're ${identityFor(joined.player.colour).name}, ${SEAT_CORNERS[joined.player.seat]!.toLowerCase()}.` });
      navigate(paths.lobby(joined.room.code));
    } catch (error) {
      const code = errorCode(error);
      setFormError(friendlyError(error));
      setJoining(false);
      // Availability changed since the preview: show the server's current picture.
      if (code === "colour-taken" || code === "room-full" || code === "game-already-started" || code === "name-taken") void loadPreview(room.code);
    }
  };

  const joinable = room?.joinable ?? false;
  const joinButton = (
    <Button type="submit" variant="primary" size="lg" block loading={joining} disabled={!joinable} icon={<EnterIcon />}>
      {joining ? "Joining…" : "Join game"}
    </Button>
  );

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(var(--action-bar-h,0px)+24px)] pt-6 sm:px-6 md:pb-16 lg:px-10 lg:pt-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Link to={paths.home()} className="press -ml-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full px-2 text-[15px] font-medium text-ink-muted hover:text-ink">
              <ArrowLeftIcon size={18} /> Home
            </Link>
            <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em] text-ink sm:text-[40px]">Join a game</h1>
            <p className="text-[17px] text-ink-muted">Enter the code your host shared, or open their invite link.</p>
          </div>
          <Card className="flex flex-col gap-4 p-5 sm:p-7">
            <TextField
              label="Room code"
              placeholder="ABC·234"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              value={formatRoomCode(code)}
              onChange={(e) => setCode(normaliseCodeInput(e.target.value))}
              error={codeError}
              hint="6 characters. Pasting an invite link works too."
              inputClassName="tabular h-16 text-[26px] font-semibold tracking-[0.14em] placeholder:tracking-[0.14em]"
            />
            {savedSeats.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[#c9d9f6] bg-[#f3f7fe] p-3.5">
                <p className="text-[15px] font-semibold text-ink">You already have a seat in this room</p>
                {savedSeats.map((seat) => (
                  <Button key={seat.playerId} variant="secondary" icon={<ResumeIcon size={18} />} onClick={() => navigate(paths.lobby(seat.roomCode))}>
                    Resume as {seat.displayName}
                  </Button>
                ))}
                <p className="text-[13px] text-ink-muted">Or join below as a different player (for example, a friend on this device).</p>
              </div>
            ) : null}
          </Card>

          <Card className="flex min-h-[220px] flex-col gap-4 p-5 sm:p-7" aria-live="polite" aria-busy={preview.kind === "loading"}>
            {preview.kind === "idle" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-ink-muted">
                <p className="text-[15px] font-medium">The room appears here once the code is complete.</p>
              </div>
            ) : null}
            {preview.kind === "loading" ? (
              <div className="flex flex-1 items-center justify-center gap-3 text-ink-muted">
                <Spinner size={20} /> <span className="text-[15px] font-medium">Looking up {formatRoomCode(code)}…</span>
              </div>
            ) : null}
            {preview.kind === "error" ? (
              <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <p className="text-[15px] font-semibold text-danger">{preview.message}</p>
              </div>
            ) : null}
            {room ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl font-semibold text-ink">{room.name ?? `Room ${formatRoomCode(room.code)}`}</p>
                    <p className="text-[13px] text-ink-muted">
                      {room.hostName ? (
                        <span className="inline-flex items-center gap-1">
                          <CrownIcon size={14} /> Hosted by {room.hostName}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {room.joinable ? <Badge tone="available" dot>Open</Badge> : <Badge tone="neutral">Closed to new players</Badge>}
                </div>
                <p className="tabular text-[15px] font-semibold text-ink">
                  {room.joinedCount} of {room.maxPlayers} players
                </p>
                <ul className="flex flex-col gap-2">
                  {room.colours
                    .filter((c) => c.taken)
                    .map((c) => (
                      <li key={c.colour} className="flex items-center gap-3 rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2">
                        <PlayerToken identity={identityFor(c.colour)} size={32} shadow={false} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{c.takenBy}</span>
                        <span className="text-[13px] text-ink-muted">{c.colourName}</span>
                      </li>
                    ))}
                </ul>
                {!room.joinable && room.blockedReason ? <p className="text-[15px] font-medium text-ink-muted">{BLOCKED[room.blockedReason]}</p> : null}
              </>
            ) : null}
          </Card>
        </div>

        <Card className={`flex flex-col gap-5 self-start p-5 sm:p-7 lg:sticky lg:top-20 ${room && joinable ? "" : "opacity-60"}`}>
          <h2 className="font-display text-xl font-semibold text-ink">Your seat</h2>
          <TextField label="Your name" autoComplete="nickname" maxLength={24} placeholder="e.g. Ben" value={name} onChange={(e) => setName(e.target.value)} error={nameError} disabled={!room || !joinable} />
          <ColourPicker
            label="Your colour"
            value={colour}
            onChange={setColour}
            options={(room?.colours ?? []).map((c) => ({ identity: identityFor(c.colour), seat: c.seat, takenBy: c.taken ? (c.takenBy ?? "another player") : null }))}
          />
          {formError ? (
            <p role="alert" className="rounded-[var(--radius-control)] border border-[#f5c6cd] bg-[#fff5f6] px-3.5 py-2.5 text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}
          <div className="hidden md:block">{joinButton}</div>
        </Card>
      </div>

      <MobileActionBar>{joinButton}</MobileActionBar>
    </form>
  );
}
