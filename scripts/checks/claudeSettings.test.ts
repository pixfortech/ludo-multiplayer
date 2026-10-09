// Guards the committed Claude Code permission policy (docs/architecture/claude-code-permissions.md).
// Fails if anyone reintroduces blanket permissions or auto-approves paid,
// remote or destructive operations.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Settings {
  permissions: { allow?: string[]; ask?: string[]; deny?: string[]; defaultMode?: string };
  [key: string]: unknown;
}

const raw = readFileSync(".claude/settings.json", "utf8");
const settings = JSON.parse(raw) as Settings;
const allow = settings.permissions.allow ?? [];
const ask = settings.permissions.ask ?? [];

/** Shell commands that may run without a prompt: project checks and read-only git. */
const SAFE_BASH = [
  /^npm run (test|typecheck|build|lint)( \*)?$/,
  /^npm run design:generate$/,
  /^npx vitest run( \*)?$/,
  /^npx tsc -p \*$/,
  /^git (status|log|diff)( \*)?$/,
  /^git (show|ls-files|check-attr|rev-parse) \*$/,
  /^git branch (--show-current|-a|-vv)$/,
  /^git remote -v$/,
];
const READ_ONLY_HIGGSFIELD = new Set(["balance", "list_workspaces", "models_explore", "transactions", "get_preferences"]);
const PAID_HIGGSFIELD = ["generate_image", "generate_video", "generate_audio", "generate_3d", "generate_image_batch", "generate_video_batch", "generate_audio_batch", "execute_preset", "upscale_image", "upscale_video"];

describe(".claude/settings.json permission policy", () => {
  it("is valid JSON with a permissions object and no permissive default mode", () => {
    expect(settings.permissions).toBeTypeOf("object");
    expect(["bypassPermissions", "dontAsk", "auto"]).not.toContain(settings.permissions.defaultMode);
  });

  it("has no blanket allow rules (bare tool names or whole MCP servers)", () => {
    for (const rule of allow) {
      const isScopedTool = /^[A-Za-z]+\(.+\)$/.test(rule);
      const isSingleMcpTool = /^mcp__[^_].*__[a-z0-9_]+$/.test(rule);
      expect(isScopedTool || isSingleMcpTool, rule).toBe(true);
      expect(rule, rule).not.toMatch(/^[A-Za-z]+\(\*\)$/);
    }
  });

  it("only auto-approves project checks and read-only git in the shell", () => {
    for (const rule of allow.filter((r) => r.startsWith("Bash("))) {
      const command = rule.slice(5, -1);
      expect(SAFE_BASH.some((re) => re.test(command)), rule).toBe(true);
    }
  });

  it("auto-approves file edits only inside source, docs, scripts and assets", () => {
    for (const rule of allow.filter((r) => r.startsWith("Edit("))) {
      expect(rule).toMatch(/^Edit\(\/(apps|packages|docs|scripts|assets)\/\*\*\)$/);
    }
  });

  it("auto-approves only read-only Higgsfield tools and always asks before paid generation", () => {
    for (const rule of allow.filter((r) => r.startsWith("mcp__Higgsfield__"))) {
      expect(READ_ONLY_HIGGSFIELD.has(rule.replace("mcp__Higgsfield__", "")), rule).toBe(true);
    }
    for (const tool of PAID_HIGGSFIELD) expect(ask, tool).toContain(`mcp__Higgsfield__${tool}`);
  });

  it("asks before pushes, destructive git/file operations, deployments and credential reads", () => {
    for (const rule of [
      "Bash(git push *)",
      "Bash(git reset --hard *)",
      "Bash(git clean *)",
      "Bash(rm -rf *)",
      "Bash(npm publish *)",
      "Bash(gh *)",
      "Read(/.env)",
      "Read(~/.ssh/**)",
      "Edit(/.claude/**)",
      "mcp__github__merge_pull_request",
      "mcp__github__push_files",
      "mcp__Claude_Code_Remote__create_trigger",
    ]) {
      expect(ask, rule).toContain(rule);
    }
  });

  it("never both allows and asks for the same rule", () => {
    expect(allow.filter((rule) => ask.includes(rule))).toEqual([]);
  });

  it("contains no credentials", () => {
    expect(raw).not.toMatch(/(ghp_|github_pat_|gho_|sk-[A-Za-z0-9]{10}|AKIA[0-9A-Z]{12}|xox[abp]-|-----BEGIN)/);
  });
});

describe("local settings stay private", () => {
  it(".claude/settings.local.json is git-ignored and untracked", () => {
    expect(execFileSync("git", ["check-ignore", ".claude/settings.local.json"], { encoding: "utf8" }).trim()).toBe(
      ".claude/settings.local.json",
    );
    expect(execFileSync("git", ["ls-files", ".claude"], { encoding: "utf8" }).trim()).toBe(".claude/settings.json");
  });
});
