// Migration 0003 — session resume, pause reasons and retention (Phase 2D).
// Immutable once applied, like 0001 and 0002.
//
//  • players.session_epoch: incremented whenever a connection takes control
//    of a seat; actions carry the epoch they were authorised under, so an
//    older connection loses control at once, across processes and restarts.
//  • players.pending_credential_*: two-step credential rotation. A new secret
//    is pending until the client proves it holds it; until then the current
//    secret keeps working, so a lost acknowledgement cannot lock a player out.
//  • rooms.pause_reason / paused_player_id / paused_at: why a game is paused
//    (a lost connection or the host); set exactly when status = 'paused'.
//  • rooms.ended_reason: why a room was abandoned (host, everyone left, expiry).

export const id = "0003_session_resume";

export const sql = /* sql */ `
ALTER TABLE players
  ADD COLUMN session_epoch integer NOT NULL DEFAULT 0 CHECK (session_epoch >= 0),
  ADD COLUMN pending_credential_hash bytea CHECK (pending_credential_hash IS NULL OR octet_length(pending_credential_hash) = 32),
  ADD COLUMN pending_credential_issued_at timestamptz;

ALTER TABLE rooms
  ADD COLUMN pause_reason text CHECK (pause_reason IN ('connection-lost', 'host')),
  ADD COLUMN paused_player_id uuid,
  ADD COLUMN paused_at timestamptz,
  ADD COLUMN ended_reason text CHECK (ended_reason IN ('closed-by-host', 'everyone-left', 'expired')),
  ADD CONSTRAINT rooms_pause_consistent CHECK ((status = 'paused') = (pause_reason IS NOT NULL AND paused_at IS NOT NULL));

CREATE INDEX rooms_retention_idx ON rooms (status, last_activity_at) WHERE archived_at IS NULL;
`;
