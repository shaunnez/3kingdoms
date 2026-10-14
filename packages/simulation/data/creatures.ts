import type { ActorKind } from "../../contracts/game";
import type { CreatureDef } from "../engine/types";

export const CREATURES: Partial<Record<ActorKind, CreatureDef>> = {
  wolf: {
    kind: "wolf",
    id: "creature.briar-hound",
    attack: {
      name: "Rending bite",
      windup: 0.8,
      cooldown: 2.2,
      engage: 1.9,
      reach: 2.8,
      damage: 30,
    },
    sight: 8,
    leash: 14,
    speed: 3.8,
    respawn: 35,
    reward: { xp: 65, marks: 6, minShare: 0.05, window: 20 },
  },
  guard: {
    kind: "guard",
    id: "npc.concord-watch",
    attack: {
      name: "Concord strike",
      windup: 0.8,
      cooldown: 1.7,
      engage: 1.9,
      reach: 2.8,
      damage: 150,
    },
    sight: 20,
    leash: 40,
    speed: 4.8,
    respawn: 60,
  },
};
