// Migration 0002 — room lifecycle guarantees (Phase 2B).
// Immutable once applied, like 0001.
//
//  • Display names are unique (case-insensitively) among a room's active players.
//  • Room status may only change along ROOM_STATUS_TRANSITIONS
//    (@ludo/shared-types); new rooms start in the lobby. A test checks that
//    this trigger and the TypeScript table agree on every pair.
//  • No conflicting representations: archived_at is set exactly when the room
//    is archived, and settings.maxPlayers always equals max_players.

export const id = "0002_room_lifecycle";

export const sql = /* sql */ `
CREATE UNIQUE INDEX players_active_name_idx ON players (room_id, lower(display_name)) WHERE left_at IS NULL;

CREATE FUNCTION rooms_check_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'lobby' THEN
      RAISE EXCEPTION 'A new room must start in the lobby, not %', NEW.status USING ERRCODE = 'LD001';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status, NEW.status) NOT IN (
    ('lobby', 'playing'), ('lobby', 'abandoned'),
    ('playing', 'paused'), ('playing', 'finished'), ('playing', 'abandoned'),
    ('paused', 'playing'), ('paused', 'abandoned'),
    ('finished', 'archived'),
    ('abandoned', 'archived')
  ) THEN
    RAISE EXCEPTION 'Room status cannot change from % to %', OLD.status, NEW.status USING ERRCODE = 'LD001';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER rooms_status_transition
  BEFORE INSERT OR UPDATE OF status ON rooms
  FOR EACH ROW EXECUTE FUNCTION rooms_check_status_transition();

ALTER TABLE rooms
  ADD CONSTRAINT rooms_archived_consistent CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  ADD CONSTRAINT rooms_settings_max_players CHECK (settings -> 'maxPlayers' = to_jsonb(max_players));
`;
