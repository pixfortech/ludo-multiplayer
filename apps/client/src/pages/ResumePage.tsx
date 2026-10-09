import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ArrowLeftIcon, EnterIcon, PlusIcon, ResumeIcon } from "../components/ui/Icons";
import { formatRoomCode, relativeTime } from "../lib/format";
import { Link, paths, useRouter } from "../lib/router";
import { useGame } from "../state/gameClient";

/** Seats this browser can resume, newest first. Resuming happens in the lobby, against the server. */
export function ResumePage() {
  const { seats } = useGame();
  const { navigate } = useRouter();
  const [list, setList] = useState(() => seats.list());

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
      <Link to={paths.home()} className="press -ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[15px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeftIcon size={18} /> Home
      </Link>
      <h1 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.02em] text-ink sm:text-[40px]">Resume a saved game</h1>
      <p className="mt-2 text-[17px] text-ink-muted">Seats saved on this device. Your game continues exactly where it was.</p>

      {list.length === 0 ? (
        <Card className="mt-8 flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f0ea] text-ink-muted">
            <ResumeIcon size={26} />
          </span>
          <p className="text-[17px] font-semibold text-ink">No saved games on this device</p>
          <p className="max-w-sm text-[15px] text-ink-muted">When you create or join a room, your seat is saved here so you can come back after closing the browser.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => navigate(paths.create())}>
              Create game
            </Button>
            <Button variant="secondary" icon={<EnterIcon />} onClick={() => navigate(paths.join())}>
              Join game
            </Button>
          </div>
        </Card>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {list.map((seat) => (
            <li key={`${seat.roomCode}-${seat.playerId}`}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-semibold text-ink">{seat.roomName ?? `Room ${formatRoomCode(seat.roomCode)}`}</p>
                  <p className="text-[14px] text-ink-muted">
                    <span className="tabular font-semibold tracking-[0.06em] text-ink">{formatRoomCode(seat.roomCode)}</span> · as {seat.displayName} · saved {relativeTime(seat.savedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      seats.remove(seat.roomCode, seat.playerId);
                      setList(seats.list());
                    }}
                  >
                    Forget
                  </Button>
                  <Button variant="primary" icon={<ResumeIcon size={18} />} onClick={() => navigate(paths.lobby(seat.roomCode))}>
                    Resume
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-[13px] text-ink-muted">Seats are stored only in this browser. Forgetting a seat doesn't remove you from the room.</p>
    </div>
  );
}
