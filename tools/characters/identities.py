# The four Kolkata characters of a team (C.3A: built for Crimson, the first team).
#
# Body, face, skin, hair and clothes are fixed per character; the team colour
# is not. Clothing parts made in the team colour use the material named
# "team", which the game tints to the player's colour at runtime, so any team
# can wear any character (no personality or body type is tied to a colour).
# Each character also carries its number (1-4) on the back of its clothes.

from __future__ import annotations

import makehuman as mh

TEAM_PREVIEW = "#B3262D"  # crimson, for previews only (the game sets the team colour)

CHARACTERS = {
    # 1. Adda: a retired schoolteacher in his sixties, the neighbourhood's storyteller.
    "adda": {
        "number": 1,
        "role": "Adda — the storyteller",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.8, muscle=0.4, weight=0.62, height=0.42, proportions=0.5, african=0.22, asian=0.18, caucasian=0.6),
            {"nose/nose-scale-horiz-incr": 0.35, "nose/nose-hump-incr": 0.4, "nose/nose-point-width-incr": 0.3, "chin/chin-width-incr": 0.3, "head/head-round": 0.35, "eyebrows/eyebrows-angle-down": 0.25, "mouth/mouth-lowerlip-volume-incr": 0.2},
        ),
        "look": {"skin": "#A06E4E", "lips": "#7B4A40", "brow": "#B9B4AC", "brow_thickness": 0.55, "brow_strength": 0.75, "stubble": 0.0, "seed": 11, "iris": "#3B2A1F"},
        "hair": {"style": "receding", "colour": "#A8A29A"},
        "moustache": "#9C958B",
        "glasses": {"frame": "#2B2522", "round": True},
        "outfit": "panjabi",
        "palette": {"trim": "#E9DFC8", "lower": "#F1EDE4", "shoes": "#6B4A33"},
        "prop": None,
        "idle": "adda",
    },
    # 2. Tea: a young graphic designer who never refuses a bhar of cha.
    "tea": {
        "number": 2,
        "role": "Cha — the tea lover",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.53, muscle=0.42, weight=0.45, height=0.42, proportions=0.65, african=0.25, asian=0.2, caucasian=0.55),
            {"nose/nose-scale-horiz-decr": 0.15, "nose/nose-point-up": 0.2, "mouth/mouth-upperlip-volume-incr": 0.3, "chin/chin-prominent-decr": 0.2, "head/head-oval": 0.4},
        ),
        "look": {"skin": "#B07C59", "lips": "#8E4A4A", "brow": "#1E1612", "brow_thickness": 0.42, "brow_arch": 0.5, "lid_shadow": 0.3, "seed": 22, "iris": "#2A1B12", "bindi": "#9C1C24"},
        "hair": {"style": "braid", "colour": "#16110E"},
        "outfit": "salwar",
        "palette": {"trim": "#D8A93B", "lower": "#EFE6D2", "dupatta": "#E3B85A", "shoes": "#B08A3C"},
        "accessories": ["bangles"],
        "prop": "cup",
        "idle": "tea",
    },
    # 3. Newspaper: a bank clerk in his forties who reads every page before work.
    "newspaper": {
        "number": 3,
        "role": "Kagoj — the newspaper reader",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.64, muscle=0.5, weight=0.55, height=0.58, proportions=0.55, african=0.3, asian=0.15, caucasian=0.55),
            {"nose/nose-scale-vert-incr": 0.3, "nose/nose-greek-incr": 0.2, "head/head-rectangular": 0.4, "chin/chin-height-incr": 0.2, "mouth/mouth-scale-horiz-decr": 0.15},
        ),
        "look": {"skin": "#94643F", "lips": "#6E4033", "brow": "#1A1410", "brow_thickness": 0.5, "stubble": 0.6, "stubble_colour": "#2A211C", "seed": 33, "iris": "#24180F"},
        "hair": {"style": "short_side", "colour": "#1B1612"},
        "glasses": {"frame": "#1C1C1E", "round": False},
        "outfit": "shirt",
        "palette": {"trim": "#E6E1D7", "lower": "#3C3F45", "shoes": "#1E1A18", "belt": "#2B211B"},
        "accessories": ["watch"],
        "prop": "newspaper",
        "idle": "newspaper",
    },
    # 4. Exercise: a college sprinter who warms up whenever she waits.
    "exercise": {
        "number": 4,
        "role": "Byayam — the morning runner",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.46, muscle=0.68, weight=0.38, height=0.62, proportions=0.7, african=0.3, asian=0.25, caucasian=0.45),
            {"nose/nose-scale-horiz-decr": 0.25, "chin/chin-prominent-incr": 0.2, "head/head-invertedtriangular": 0.35, "eyebrows/eyebrows-angle-up": 0.2},
        ),
        "look": {"skin": "#8F5E3E", "lips": "#7A4038", "brow": "#16100D", "brow_thickness": 0.4, "brow_arch": 0.3, "seed": 44, "iris": "#2E1F14"},
        "hair": {"style": "ponytail", "colour": "#120D0B"},
        "outfit": "tracksuit",
        "palette": {"trim": "#F5F3EE", "lower": "#26272B", "shoes": "#F2F1EC", "sole": "#B9B6AE", "band": "#F5F3EE"},
        "accessories": ["headband"],
        "prop": None,
        "idle": "exercise",
    },
}
