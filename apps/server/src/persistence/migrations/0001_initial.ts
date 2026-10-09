// Migration 0001 — rooms, players, game sessions, game events.
// Immutable once applied: the migrator stores a checksum and refuses to run
// if this text changes. Schema changes go in a new numbered migration.

export const id = "0001_initial";

export const sql = /* sql */ `
CREATE TABLE rooms (
  id               uuid        PRIMARY KEY,
  code             text        NOT NULL,
  name             text        CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 40),
  host_player_id   uuid,
  max_players      smallint    NOT NULL CHECK (max_players BETWEEN 2 AND 15),
  visibility       text        NOT NULL CHECK (visibility IN ('private', 'public')),
  settings         jsonb       NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  status           text        NOT NULL CHECK (status IN ('lobby', 'playing', 'paused', 'finished', 'abandoned', 'archived')),
  room_version     integer     NOT NULL DEFAULT 0 CHECK (room_version >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  archived_at      timestamptz,
  CONSTRAINT rooms_code_format CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  CONSTRAINT rooms_code_key UNIQUE (code)
);
CREATE INDEX rooms_last_activity_idx ON rooms (last_activity_at) WHERE archived_at IS NULL;

CREATE TABLE players (
  id                    uuid        PRIMARY KEY,
  room_id               uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  display_name          text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 24),
  seat                  smallint    NOT NULL CHECK (seat BETWEEN 0 AND 14),
  colour                text        NOT NULL CHECK (colour ~ '^[a-z][a-z-]{1,23}$'),
  kind                  text        NOT NULL DEFAULT 'remote' CHECK (kind IN ('remote', 'local')),
  connection_status     text        NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'left')),
  credential_hash       bytea       NOT NULL CHECK (octet_length(credential_hash) = 32),
  credential_version    integer     NOT NULL DEFAULT 1 CHECK (credential_version >= 1),
  credential_issued_at  timestamptz NOT NULL DEFAULT now(),
  credential_revoked_at timestamptz,
  joined_at             timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  left_at               timestamptz,
  finish_place          smallint    CHECK (finish_place IS NULL OR finish_place BETWEEN 1 AND 15)
);
CREATE INDEX players_room_idx ON players (room_id);
-- Seats and colours are unique among players who have not left the room.
CREATE UNIQUE INDEX players_active_seat_idx   ON players (room_id, seat)   WHERE left_at IS NULL;
CREATE UNIQUE INDEX players_active_colour_idx ON players (room_id, colour) WHERE left_at IS NULL;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_host_fk FOREIGN KEY (host_player_id) REFERENCES players (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE game_sessions (
  room_id               uuid        PRIMARY KEY REFERENCES rooms (id) ON DELETE CASCADE,
  state                 jsonb       NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  state_version         integer     NOT NULL CHECK (state_version >= 0),
  engine_schema_version smallint    NOT NULL,
  phase                 text        NOT NULL CHECK (phase IN ('playing', 'finished')),
  current_player_id     uuid,
  settings              jsonb       NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  winner_player_id      uuid,
  ranking               jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ranking) = 'array'),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_events (
  id                   bigserial   PRIMARY KEY,
  room_id              uuid        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  seq                  integer     NOT NULL CHECK (seq >= 1),
  player_id            uuid        REFERENCES players (id),
  action_type          text        NOT NULL CHECK (char_length(action_type) BETWEEN 1 AND 40),
  request_id           text        CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 64),
  payload              jsonb       NOT NULL,
  result_state_version integer     NOT NULL CHECK (result_state_version >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_events_seq_key UNIQUE (room_id, seq)
);
-- Idempotency: one committed action per (room, player, client request id).
CREATE UNIQUE INDEX game_events_request_idx ON game_events (room_id, player_id, request_id) WHERE request_id IS NOT NULL;
`;
