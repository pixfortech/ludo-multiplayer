// Non-secret conveniences remembered per browser (the last display name used).

import { browserStorage } from "./session";

const NAME_KEY = "ludo.name.v1";

export function rememberedName(): string {
  try {
    return browserStorage("local")?.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  try {
    browserStorage("local")?.setItem(NAME_KEY, name);
  } catch {
    // not essential
  }
}
