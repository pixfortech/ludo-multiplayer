import { useMemo, useState, type FormEvent } from "react";
import { ClassicBoardArt, type BoardPiece } from "../components/brand/ClassicBoardArt";
import { MobileActionBar } from "../components/layout/MobileActionBar";
import { AUTO_COLOUR, ColourPicker } from "../components/game/ColourPicker";
import { PlayerToken } from "../components/game/PlayerToken";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextField } from "../components/ui/Field";
import { ArrowLeftIcon, PlusIcon } from "../components/ui/Icons";
import { Segmented } from "../components/ui/Segmented";
import { Switch } from "../components/ui/Switch";
import { useToasts } from "../components/ui/Toasts";
import { friendlyError } from "../lib/errors";
import { SEAT_CORNERS } from "../lib/format";
import { CLASSIC_IDENTITIES, identityFor } from "../lib/identities";
import { Link, paths, useRouter } from "../lib/router";
import { rememberName, rememberedName } from "../lib/preferences";
import { useGame } from "../state/gameClient";

/** The seat the server's automatic allocation gives the first player: seat 0 (top left). */
const AUTO_HOST_SEAT = 0;

/**
 * Seats a room would use with the host at `host` and the others seated
 * automatically. Preview only, mirroring the server's rule (the free seat
 * farthest from every taken one, ties to the lowest); the server decides.
 */
export function previewSeats(host: number, players: number): number[] {
  const taken = [host];
  while (taken.length < players) {
    let best = -1;
    let bestDistance = -1;
    for (let seat = 0; seat < 4; seat++) {
      if (taken.includes(seat)) continue;
      const distance = Math.min(...taken.map((t) => Math.min(Math.abs(seat - t), 4 - Math.abs(seat - t))));
      if (distance > bestDistance) [best, bestDistance] = [seat, distance];
    }
    taken.push(best);
  }
  return taken.sort((a, b) => a - b);
}

export function CreateRoomPage() {
  const { client, seats, tab } = useGame();
  const { navigate } = useRouter();
  const toasts = useToasts();
  const [name, setName] = useState(rememberedName);
  const [roomName, setRoomName] = useState("");
  const [players, setPlayers] = useState<2 | 3 | 4>(4);
  const [colour, setColour] = useState<string>(AUTO_COLOUR);
  const [autoMove, setAutoMove] = useState(true);
  const [ranking, setRanking] = useState<"winner-only" | "full-ranking">("winner-only");
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const hostSeat = colour === AUTO_COLOUR ? AUTO_HOST_SEAT : CLASSIC_IDENTITIES.findIndex((i) => i.id === colour);
  const hostIdentity = CLASSIC_IDENTITIES[hostSeat]!;
  const preview = useMemo<BoardPiece[]>(() => [0, 1, 2, 3].map((slot) => ({ key: `h${slot}`, seat: hostSeat, step: null, slot })), [hostSeat]);
  const activeSeats = previewSeats(hostSeat, players);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length < 1 || [...trimmed].length > 24) {
      setNameError("Choose a name of 1–24 characters.");
      return;
    }
    setNameError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await client.createRoom({
        hostName: trimmed,
        maxPlayers: players,
        roomName: roomName.trim() || null,
        colour,
        autoMove,
        rankingMode: ranking,
      });
      rememberName(trimmed);
      seats.save({ roomCode: created.room.code, playerId: created.player.playerId, secret: created.credential.secret, displayName: created.player.displayName, roomName: created.room.name });
      tab.set({ roomCode: created.room.code, playerId: created.player.playerId });
      toasts.push({ tone: "success", title: "Room created", body: `You're ${identityFor(created.player.colour).name}. Share the code to invite friends.` });
      navigate(paths.lobby(created.room.code));
    } catch (error) {
      setFormError(friendlyError(error));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(var(--action-bar-h,0px)+24px)] pt-6 sm:px-6 md:pb-16 lg:px-10 lg:pt-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Link to={paths.home()} className="press -ml-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full px-2 text-[15px] font-medium text-ink-muted hover:text-ink">
              <ArrowLeftIcon size={18} /> Home
            </Link>
            <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em] text-ink sm:text-[40px]">Create a game</h1>
            <p className="text-[17px] text-ink-muted">Set up your table. You'll get a code to share with friends.</p>
          </div>
          <Card className="flex flex-col gap-5 p-5 sm:p-7">
            <h2 className="font-display text-xl font-semibold text-ink">You</h2>
            <TextField label="Your name" autoComplete="nickname" maxLength={24} placeholder="e.g. Aman" value={name} onChange={(e) => setName(e.target.value)} error={nameError} hint="Shown to everyone in the room." />
            <ColourPicker
              label="Your colour"
              value={colour}
              onChange={setColour}
              options={CLASSIC_IDENTITIES.map((identity, seat) => ({ identity, seat, takenBy: null }))}
            />
          </Card>

          <Card className="flex flex-col gap-5 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-ink">Table</h2>
              <Badge tone="available">Classic</Badge>
            </div>
            <Segmented
              label="Players"
              size="lg"
              value={players}
              onChange={setPlayers}
              options={[
                { value: 2, label: "2" },
                { value: 3, label: "3" },
                { value: 4, label: "4" },
              ]}
            />
            <p className="-mt-2 text-[13px] text-ink-muted">Tables for 5–15 players are in development.</p>
            <TextField label="Room name (optional)" maxLength={40} placeholder="Friday night Ludo" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </Card>

          <Card className="flex flex-col gap-5 p-5 sm:p-7">
            <h2 className="font-display text-xl font-semibold text-ink">Rules</h2>
            <Switch label="Auto-move" description="When only one token can move, it moves for you." checked={autoMove} onChange={setAutoMove} />
            <div className="h-px bg-border" />
            <Segmented
              label="Game ends"
              value={ranking}
              onChange={setRanking}
              options={[
                { value: "winner-only", label: "First player home" },
                { value: "full-ranking", label: "Full ranking" },
              ]}
            />
            <p className="-mt-2 text-[13px] text-ink-muted">Classic rules: a six to enter, a bonus roll for sixes, captures and home; three sixes forfeit the turn.</p>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Summary">
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="mx-auto w-full max-w-[300px] lg:w-[clamp(150px,calc(100svh-500px),280px)]">
              <ClassicBoardArt pieces={preview} activeSeats={activeSeats} liftedSeat={hostSeat} title={`Preview: ${players} seats, you in ${hostIdentity.name}`} />
            </div>
            <div className="flex items-center gap-3">
              <PlayerToken identity={hostIdentity} size={44} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{name.trim() || "You"} · host</p>
                <p className="text-[13px] text-ink-muted">
                  {colour === AUTO_COLOUR ? `Auto: usually ${hostIdentity.name}, ${SEAT_CORNERS[hostSeat]!.toLowerCase()}` : `${hostIdentity.name}, ${SEAT_CORNERS[hostSeat]!.toLowerCase()}`}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2">
                <dt className="text-ink-muted">Players</dt>
                <dd className="font-semibold text-ink">{players}</dd>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2">
                <dt className="text-ink-muted">Auto-move</dt>
                <dd className="font-semibold text-ink">{autoMove ? "On" : "Off"}</dd>
              </div>
              <div className="col-span-2 rounded-[var(--radius-control)] bg-[#f6f3ee] px-3 py-2">
                <dt className="text-ink-muted">Game ends</dt>
                <dd className="font-semibold text-ink">{ranking === "winner-only" ? "When the first player gets all four home" : "When every place is decided"}</dd>
              </div>
            </dl>
            {formError ? (
              <p role="alert" className="rounded-[var(--radius-control)] border border-[#f5c6cd] bg-[#fff5f6] px-3.5 py-2.5 text-sm font-medium text-danger">
                {formError}
              </p>
            ) : null}
            <div className="hidden md:block">
              <Button type="submit" variant="primary" size="lg" block loading={submitting} icon={<PlusIcon />}>
                {submitting ? "Creating room…" : "Create room"}
              </Button>
            </div>
          </Card>
        </aside>
      </div>

      <MobileActionBar>
        <Button type="submit" variant="primary" size="lg" block loading={submitting} icon={<PlusIcon />}>
          {submitting ? "Creating room…" : "Create room"}
        </Button>
      </MobileActionBar>
    </form>
  );
}
