// The room service on the in-memory store: behavioural parity with PostgreSQL.
import { MemoryGameStore } from "../../persistence/memoryStore.js";
import { runRoomServiceSuite } from "./roomServiceSuite.js";

runRoomServiceSuite("memory", async () => {
  const store = new MemoryGameStore();
  return { store, teardown: () => store.close() };
});
