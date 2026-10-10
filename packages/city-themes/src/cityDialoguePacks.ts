// Ambient dialogue: short, text-first lines a city "says" at game moments.
// Lines are captions first (voice is a later, optional hook), are always
// muteable, and never carry game information a player needs: the board and
// the turn banner do that.
//
// Every line is DRAFT copy written for this project. Lines in Bengali,
// Hindi, Tamil, Kannada, Marathi or local mixes are romanised and need a
// native speaker's review before release (reviewStatus says so).

import type { CityThemeId, GameMoment, LanguageTag } from "./cityThemeTypes.js";

export interface DialogueLine {
  /** What the caption shows. */
  text: string;
  /** Plain-English meaning, for review and for an optional translation line. */
  meaning: string;
  language: LanguageTag;
}

export interface DialoguePack {
  id: CityThemeId;
  reviewStatus: "draft-needs-native-review" | "reviewed";
  /** At least two lines per moment, so repeats feel less mechanical. */
  lines: Readonly<Record<GameMoment, readonly DialogueLine[]>>;
}

const en = (text: string): DialogueLine => ({ text, meaning: text, language: "en" });
const line = (language: LanguageTag, text: string, meaning: string): DialogueLine => ({ text, meaning, language });

const bn = (text: string, meaning: string) => line("bn", text, meaning);
const hi = (text: string, meaning: string) => line("hi", text, meaning);
const ta = (text: string, meaning: string) => line("ta", text, meaning);
const kn = (text: string, meaning: string) => line("kn", text, meaning);

const KOLKATA: DialoguePack = {
  id: "kolkata",
  reviewStatus: "draft-needs-native-review",
  lines: {
    "game-start": [bn("Cholun, game shuru hok.", "Come on, let the game begin."), en("The river's watching. Let's play.")],
    "dice-roll": [bn("Dekhi ki ashe…", "Let's see what comes…"), en("Roll it like a tram bell.")],
    six: [bn("Aaj jombe.", "Today it'll be great."), bn("Chhoy! Darun shuru.", "Six! A great start.")],
    capture: [bn("Ei move ta dekhun!", "Look at this move!"), en("Straight off the tram line!")],
    captured: [bn("Arre, eta ki holo?", "Oh, what just happened?"), en("Back to College Street for that one.")],
    home: [bn("Ki darun!", "How wonderful!"), en("Home across the bridge.")],
    "bonus-turn": [bn("Aar ekbar!", "One more time!"), en("Another round of adda.")],
    "turn-lost": [bn("Thik ache, porer bar.", "It's fine, next time."), en("The tram will come again.")],
    "near-win": [bn("Ebar shesh lap.", "Now the last lap."), en("The bridge lights are warming up.")],
    victory: [bn("Kolkata jitlo aaj!", "Kolkata won today!"), en("A story worth telling at the tea stall.")],
  },
};

const DELHI: DialoguePack = {
  id: "delhi",
  reviewStatus: "draft-needs-native-review",
  lines: {
    "game-start": [hi("Chalo, khel shuru karte hain.", "Come on, let's start the game."), en("The avenue is clear. Make your entrance.")],
    "dice-roll": [hi("Dekhte hain kya aata hai.", "Let's see what comes."), en("Roll it with some swagger.")],
    six: [hi("Dilli ka move alag hi hota hai.", "A Delhi move is something else."), hi("Chhakka! Shaandaar.", "Six! Splendid.")],
    capture: [hi("Yeh khel ab garam hoga.", "This game is heating up now."), en("Straight past the gate!")],
    captured: [hi("Arre yaar, wapas shuru.", "Oh man, back to the start."), en("Every empire has a setback.")],
    home: [hi("Seedha dil se, seedha board par.", "Straight from the heart, straight onto the board."), en("A grand arrival.")],
    "bonus-turn": [hi("Ek aur baari!", "One more turn!"), en("Encore on the avenue.")],
    "turn-lost": [hi("Koi baat nahi, agli baar.", "No problem, next time."), en("The parade waits a turn.")],
    "near-win": [hi("Ab bas thoda sa aur.", "Just a little more now."), en("The arch is in sight.")],
    victory: [hi("Dilli jeet gayi!", "Delhi won!"), en("A victory fit for the avenue.")],
  },
};

const CHENNAI: DialoguePack = {
  id: "chennai",
  reviewStatus: "draft-needs-native-review",
  lines: {
    "game-start": [ta("Vaanga, game aarambikkalaam.", "Come, let's begin the game."), en("Sea breeze is perfect. Let's play.")],
    "dice-roll": [ta("Paarkalaam enna varudhu.", "Let's see what comes."), en("Easy now, like the tide.")],
    six: [ta("Semma move!", "Superb move!"), ta("Aaru! Super.", "Six! Super.")],
    capture: [ta("Idhu romba interesting-a irukku.", "This is very interesting."), en("Swept off like a wave!")],
    captured: [ta("Aiyo, thirumbi poganum.", "Oh no, have to go back."), en("The tide turns. It'll turn again.")],
    home: [ta("Nalla irukku!", "That's good!"), en("Safe inside the temple gates.")],
    "bonus-turn": [ta("Innoru chance!", "Another chance!"), en("One more, nice and steady.")],
    "turn-lost": [ta("Paravaillai, adutha thadavai.", "No matter, next time."), en("The lighthouse will turn back to you.")],
    "near-win": [ta("Konjam dhooram dhaan.", "Only a little distance left."), en("The gopuram is close now.")],
    victory: [ta("Chennai jeyichiduchu!", "Chennai has won!"), en("A graceful finish by the shore.")],
  },
};

const MUMBAI: DialoguePack = {
  id: "mumbai",
  reviewStatus: "draft-needs-native-review",
  lines: {
    "game-start": [hi("Chalo, show shuru!", "Come on, the show begins!"), en("Lights, camera, dice.")],
    "dice-roll": [hi("Dekhte hain kya scene hai.", "Let's see what the scene is."), en("Roll it before the local leaves.")],
    six: [hi("Yeh move full paisa vasool.", "This move is totally worth it."), hi("Chhakka! Ekdum filmy.", "Six! Totally filmy.")],
    capture: [hi("Mumbai speed mein khelo!", "Play at Mumbai speed!"), en("Missed the local, boss!")],
    captured: [hi("Arre, wapas Churchgate.", "Oh, back to the first station."), en("Plot twist. Interval, not the end.")],
    home: [hi("Picture abhi baaki hai.", "The movie isn't over yet."), en("Home along Marine Drive.")],
    "bonus-turn": [hi("Ek aur take!", "One more take!"), en("Encore by the sea.")],
    "turn-lost": [hi("Chalta hai, next time.", "It happens, next time."), en("Monsoon delay. It'll clear.")],
    "near-win": [hi("Climax aa raha hai.", "The climax is coming."), en("Last stop coming up.")],
    victory: [hi("Superhit!", "Superhit!"), en("Blockbuster finish.")],
  },
};

const BENGALURU: DialoguePack = {
  id: "bengaluru",
  reviewStatus: "draft-needs-native-review",
  lines: {
    "game-start": [en("Game on."), kn("Shuru maadona.", "Let's start.")],
    "dice-roll": [en("Deploying roll…"), kn("Nodona yenu barutte.", "Let's see what comes.")],
    six: [kn("Super move, maga.", "Super move, buddy."), en("Six. Shipped.")],
    capture: [kn("Idhu clean play.", "This is clean play."), en("Merged right over that one.")],
    captured: [kn("Ayyo, back to base.", "Oh no, back to base."), en("Rollback. Try again.")],
    home: [en("Nice one!"), en("Home under the rain trees.")],
    "bonus-turn": [en("One more sprint!"), kn("Innondu chance, maga.", "One more chance, buddy.")],
    "turn-lost": [en("Next build will do it."), kn("Paravagilla, next time.", "No matter, next time.")],
    "near-win": [en("Almost at release."), kn("Swalpa adjust maadi.", "Adjust a little.")],
    victory: [en("Garden city wins!"), kn("Sakkath game, maga!", "Awesome game, buddy!")],
  },
};

// The classic table speaks plain English and stays quiet by default (see the settings in Batch D).
const CLASSIC: DialoguePack = {
  id: "classic",
  reviewStatus: "reviewed",
  lines: {
    "game-start": [en("Let's play."), en("Good luck, everyone.")],
    "dice-roll": [en("Rolling…"), en("Here it comes.")],
    six: [en("A six!"), en("Six — roll again.")],
    capture: [en("Captured!"), en("Sent back to base.")],
    captured: [en("Back to base."), en("Unlucky — back to the start.")],
    home: [en("Home!"), en("Safely home.")],
    "bonus-turn": [en("Another turn."), en("Bonus roll.")],
    "turn-lost": [en("No move this time."), en("Next turn.")],
    "near-win": [en("Nearly there."), en("One step from victory.")],
    victory: [en("Victory!"), en("Well played.")],
  },
};

export const CITY_DIALOGUE_PACKS: Readonly<Record<CityThemeId, DialoguePack>> = {
  classic: CLASSIC,
  kolkata: KOLKATA,
  delhi: DELHI,
  chennai: CHENNAI,
  mumbai: MUMBAI,
  bengaluru: BENGALURU,
};
