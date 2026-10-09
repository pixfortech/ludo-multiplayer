import { MemoryGameStore } from "../memoryStore.js";
import { runGameStoreContract } from "./storeContract.js";

runGameStoreContract("memory", async () => {
  const store = new MemoryGameStore();
  return { store, teardown: () => store.close() };
});
