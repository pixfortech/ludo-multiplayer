// Player identities (colour + symbol) by the colour id the server assigns.

import { PLAYER_IDENTITIES, type PlayerIdentity } from "@ludo/design-tokens";

const BY_ID = new Map(PLAYER_IDENTITIES.map((identity) => [identity.id, identity]));

export function identityFor(colourId: string): PlayerIdentity {
  return BY_ID.get(colourId) ?? PLAYER_IDENTITIES[0]!;
}

/** The classic board's four identities, in seat order. */
export const CLASSIC_IDENTITIES = PLAYER_IDENTITIES.slice(0, 4);
