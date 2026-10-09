/** Removes connection strings and password assignments from text that may be logged. */
export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"]*/gi, "postgres://[redacted]")
    .replace(/(password\s*[=:]\s*)[^\s'"&]+/gi, "$1[redacted]");
}
