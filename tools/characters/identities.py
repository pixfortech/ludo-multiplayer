# Kolkata's sixteen characters: four teams of four (C.3A built the first team,
# C.3B the other three). Which seat plays which team is the game's choice
# (CHARACTER_TEAMS in apps/client/src/components/board3d/characters/catalog.ts).
#
# In every team the four share the same base routine, so their activities fit
# together: a storyteller ("adda") talks with a tea drinker ("tea"), a reader
# ("newspaper") reads and looks up, an active one ("exercise") stretches.
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

    # ---- Team 2 (C.3B) ----
    # 5. Dida: a grandmother who has seen everything and tells it all.
    "dida": {
        "number": 1,
        "role": "Dida — the grandmother",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.92, muscle=0.3, weight=0.6, height=0.32, proportions=0.45, african=0.25, asian=0.2, caucasian=0.55),
            {"head/head-round": 0.3, "nose/nose-scale-horiz-incr": 0.2, "mouth/mouth-angles-down": 0.2, "chin/chin-width-incr": 0.2, "cheek/l-cheek-volume-incr": 0.3, "cheek/r-cheek-volume-incr": 0.3},
        ),
        "look": {"skin": "#A87452", "lips": "#7E4C42", "brow": "#CFC9C0", "brow_thickness": 0.35, "brow_arch": 0.3, "seed": 55, "iris": "#3A2A1E", "bindi": "#B0212B"},
        "hair": {"style": "bun", "colour": "#D8D3CB"},
        "glasses": {"frame": "#6B5A44", "round": True},
        "outfit": "salwar",
        "palette": {"trim": "#F2EEE6", "lower": "#F2EEE6", "dupatta": "#F4F1EA", "shoes": "#5A4636"},
        "accessories": ["bangles"],
        "prop": None,
        "idle": "adda",
    },
    # 6. Rickshaw-puller: a wiry man on his break, a clay cup of cha in hand.
    "rickshaw": {
        "number": 2,
        "role": "Rikshawala — on his tea break",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.6, muscle=0.62, weight=0.3, height=0.45, proportions=0.45, african=0.35, asian=0.2, caucasian=0.45),
            {"head/head-triangular": 0.3, "cheek/l-cheek-bones-incr": 0.4, "cheek/r-cheek-bones-incr": 0.4, "nose/nose-flaring-incr": 0.3, "chin/chin-prominent-incr": 0.2},
        ),
        "look": {"skin": "#7E5034", "lips": "#5E372C", "brow": "#16110D", "brow_thickness": 0.55, "stubble": 0.45, "stubble_colour": "#2A211C", "seed": 66, "iris": "#22170F"},
        "hair": {"style": "crop", "colour": "#17120F"},
        "moustache": "#16110E",
        "outfit": "panjabi",
        "palette": {"trim": "#D9CDB2", "lower": "#3E5A6B", "shoes": "#3B2B20"},
        "prop": "cup",
        "idle": "tea",
    },
    # 7. Student: a Presidency student, never without the day's paper.
    "student": {
        "number": 3,
        "role": "Chhatro — the student",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.4, muscle=0.45, weight=0.4, height=0.62, proportions=0.6, african=0.2, asian=0.25, caucasian=0.55),
            {"head/head-oval": 0.35, "nose/nose-scale-vert-incr": 0.2, "mouth/mouth-scale-horiz-incr": 0.15, "chin/chin-height-decr": 0.15},
        ),
        "look": {"skin": "#A2704C", "lips": "#7A473A", "brow": "#1A1410", "brow_thickness": 0.45, "seed": 77, "iris": "#2A1C12"},
        "hair": {"style": "short_side", "colour": "#120E0B"},
        "glasses": {"frame": "#2E3A55", "round": False},
        "outfit": "shirt",
        "palette": {"trim": "#E8E4DA", "lower": "#2F3C5A", "shoes": "#2A2420", "belt": "#2B211B"},
        "prop": "newspaper",
        "idle": "newspaper",
    },
    # 8. Footballer: a Mohun Bagan fan who plays every evening on the Maidan.
    "footballer": {
        "number": 4,
        "role": "Khelowar — the footballer",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.44, muscle=0.75, weight=0.42, height=0.6, proportions=0.7, african=0.3, asian=0.2, caucasian=0.5),
            {"head/head-square": 0.3, "chin/chin-width-incr": 0.25, "nose/nose-scale-horiz-incr": 0.15, "eyebrows/eyebrows-angle-down": 0.15},
        ),
        "look": {"skin": "#8A5A3B", "lips": "#6B3D31", "brow": "#15100C", "brow_thickness": 0.5, "stubble": 0.25, "stubble_colour": "#231B16", "seed": 88, "iris": "#22170F"},
        "hair": {"style": "crop", "colour": "#120E0B"},
        "outfit": "tracksuit",
        "palette": {"trim": "#F5F3EE", "lower": "#1F2024", "shoes": "#F2F1EC", "sole": "#B9B6AE", "band": "#F5F3EE"},
        "accessories": ["watch"],
        "prop": None,
        "idle": "exercise",
    },
    # ---- Team 3 (C.3B) ----
    # 9. Kaku: an uncle with an opinion on every match and every election.
    "kaku": {
        "number": 1,
        "role": "Kaku — the uncle with opinions",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.74, muscle=0.35, weight=0.78, height=0.48, proportions=0.45, african=0.25, asian=0.15, caucasian=0.6),
            {"head/head-fat-incr": 0.35, "head/head-round": 0.3, "nose/nose-volume-incr": 0.3, "chin/chin-width-incr": 0.2, "mouth/mouth-lowerlip-volume-incr": 0.2},
        ),
        "look": {"skin": "#9C6A49", "lips": "#744538", "brow": "#5B524A", "brow_thickness": 0.6, "brow_strength": 0.8, "stubble": 0.2, "stubble_colour": "#4A423B", "seed": 99, "iris": "#33251B"},
        "hair": {"style": "receding", "colour": "#4A443E"},
        "outfit": "shirt",
        "palette": {"trim": "#EDE8DD", "lower": "#6F6A5E", "shoes": "#4A3527", "belt": "#2B211B"},
        "accessories": ["watch"],
        "prop": None,
        "idle": "adda",
    },
    # 10. Didi: an office worker on her way home, stopping for a cup.
    "didi": {
        "number": 2,
        "role": "Didi — the office-goer",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.58, muscle=0.4, weight=0.5, height=0.5, proportions=0.6, african=0.2, asian=0.25, caucasian=0.55),
            {"head/head-diamond": 0.3, "nose/nose-point-width-decr": 0.2, "mouth/mouth-cupidsbow-incr": 0.3, "chin/chin-triangle": 0.2},
        ),
        "look": {"skin": "#B5835F", "lips": "#94504A", "brow": "#1C1511", "brow_thickness": 0.4, "brow_arch": 0.55, "lid_shadow": 0.25, "seed": 110, "iris": "#2A1B12"},
        "hair": {"style": "ponytail", "colour": "#1A130F"},
        "outfit": "salwar",
        "palette": {"trim": "#2E5E5A", "lower": "#E9E2D1", "dupatta": "#3E7A72", "shoes": "#7A5534", "band": "#2E5E5A"},
        "accessories": ["bangles", "watch"],
        "prop": "cup",
        "idle": "tea",
    },
    # 11. Professor: a retired professor of Bengali literature, reading the editorials.
    "professor": {
        "number": 3,
        "role": "Adhyapika — the professor",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.82, muscle=0.3, weight=0.45, height=0.48, proportions=0.5, african=0.2, asian=0.15, caucasian=0.65),
            {"head/head-oval": 0.3, "nose/nose-hump-incr": 0.3, "nose/nose-scale-vert-incr": 0.2, "mouth/mouth-scale-horiz-decr": 0.2, "chin/chin-prominent-incr": 0.15},
        ),
        "look": {"skin": "#A97957", "lips": "#7C4B42", "brow": "#8E877F", "brow_thickness": 0.35, "brow_arch": 0.4, "seed": 121, "iris": "#2E2119"},
        "hair": {"style": "bun", "colour": "#7D7770"},
        "glasses": {"frame": "#1E1B1A", "round": False},
        "outfit": "salwar",
        "palette": {"trim": "#6B2E3A", "lower": "#EFE8DA", "dupatta": "#8A4351", "shoes": "#3C2C22"},
        "prop": "newspaper",
        "idle": "newspaper",
    },
    # 12. Yoga: a homemaker who does her stretches on the roof every morning.
    "yoga": {
        "number": 4,
        "role": "Yoga Mashi — the morning stretcher",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.66, muscle=0.5, weight=0.55, height=0.42, proportions=0.55, african=0.3, asian=0.2, caucasian=0.5),
            {"head/head-round": 0.25, "nose/nose-scale-horiz-incr": 0.15, "cheek/l-cheek-volume-incr": 0.2, "cheek/r-cheek-volume-incr": 0.2},
        ),
        "look": {"skin": "#9A6646", "lips": "#7A4339", "brow": "#2A211B", "brow_thickness": 0.4, "brow_arch": 0.35, "seed": 132, "iris": "#2B1D14", "bindi": "#9C1C24"},
        "hair": {"style": "bun", "colour": "#231B16"},
        "outfit": "tracksuit",
        "palette": {"trim": "#EDEAE3", "lower": "#3A2F45", "shoes": "#ECEAE4", "sole": "#B9B6AE", "band": "#EDEAE3"},
        "accessories": ["bangles"],
        "prop": None,
        "idle": "exercise",
    },
    # ---- Team 4 (C.3B) ----
    # 13. Kobi: a young poet who recites at every tea stall that will listen.
    "kobi": {
        "number": 1,
        "role": "Kobi — the poet",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.5, muscle=0.35, weight=0.38, height=0.55, proportions=0.6, african=0.2, asian=0.2, caucasian=0.6),
            {"head/head-invertedtriangular": 0.3, "nose/nose-greek-incr": 0.3, "nose/nose-scale-vert-incr": 0.2, "chin/chin-height-incr": 0.2},
        ),
        "look": {"skin": "#A9764F", "lips": "#7A473A", "brow": "#16110D", "brow_thickness": 0.5, "stubble": 0.95, "stubble_colour": "#1A1410", "seed": 143, "iris": "#22170F"},
        "hair": {"style": "short_side", "colour": "#0F0B09"},
        "outfit": "panjabi",
        "palette": {"trim": "#3A3530", "lower": "#ECE6DA", "shoes": "#5A3E2B"},
        "prop": None,
        "idle": "adda",
    },
    # 14. Boudi: a sister-in-law who knows the whole para's news, over tea.
    "boudi": {
        "number": 2,
        "role": "Boudi — the neighbourhood's news",
        "person": mh.Person(
            mh.Macro(gender=0.0, age=0.62, muscle=0.35, weight=0.62, height=0.4, proportions=0.55, african=0.25, asian=0.2, caucasian=0.55),
            {"head/head-round": 0.35, "nose/nose-scale-horiz-incr": 0.2, "mouth/mouth-upperlip-volume-incr": 0.2, "mouth/mouth-angles-up": 0.2},
        ),
        "look": {"skin": "#A06C4A", "lips": "#8A4840", "brow": "#1A1310", "brow_thickness": 0.45, "brow_arch": 0.5, "lid_shadow": 0.2, "seed": 154, "iris": "#2A1B12", "bindi": "#A81E28"},
        "hair": {"style": "braid", "colour": "#1A130F"},
        "outfit": "salwar",
        "palette": {"trim": "#E0B13A", "lower": "#F0E8D6", "dupatta": "#E8C25C", "shoes": "#9A7434"},
        "accessories": ["bangles"],
        "prop": "cup",
        "idle": "tea",
    },
    # 15. Dokandar: a sweet-shop owner checking the cricket scores between customers.
    "dokandar": {
        "number": 3,
        "role": "Dokandar — the shopkeeper",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.7, muscle=0.4, weight=0.7, height=0.44, proportions=0.45, african=0.25, asian=0.2, caucasian=0.55),
            {"head/head-square": 0.3, "nose/nose-volume-incr": 0.25, "chin/chin-width-incr": 0.25, "mouth/mouth-lowerlip-volume-incr": 0.2},
        ),
        "look": {"skin": "#966343", "lips": "#6E4033", "brow": "#2A221C", "brow_thickness": 0.55, "brow_strength": 0.8, "seed": 165, "iris": "#24180F"},
        "hair": {"style": "short_side", "colour": "#3A332D"},
        "moustache": "#2A231E",
        "outfit": "panjabi",
        "palette": {"trim": "#F2EFE7", "lower": "#F2EFE7", "shoes": "#4A3527"},
        "accessories": ["watch"],
        "prop": "newspaper",
        "idle": "newspaper",
    },
    # 16. Kishore: a schoolboy who cannot keep still.
    "kishore": {
        "number": 4,
        "role": "Kishore — the schoolboy",
        "person": mh.Person(
            mh.Macro(gender=1.0, age=0.3, muscle=0.5, weight=0.4, height=0.35, proportions=0.6, african=0.25, asian=0.25, caucasian=0.5),
            {"head/head-round": 0.2, "nose/nose-scale-horiz-decr": 0.15, "nose/nose-point-up": 0.2, "mouth/mouth-angles-up": 0.2},
        ),
        "look": {"skin": "#A0704E", "lips": "#7D4A3D", "brow": "#16110D", "brow_thickness": 0.4, "seed": 176, "iris": "#2A1C12"},
        "hair": {"style": "crop", "colour": "#120E0B"},
        "outfit": "tracksuit",
        "palette": {"trim": "#F5F3EE", "lower": "#2C3E66", "shoes": "#F2F1EC", "sole": "#B9B6AE", "band": "#F5F3EE"},
        "prop": None,
        "idle": "exercise",
    },
}
