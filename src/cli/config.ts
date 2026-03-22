import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mailConfigSchema } from "../schemas.js";
import type { MailConfig } from "../types.js";
import { MailError } from "../types.js";

/** Default config path following XDG Base Directory spec. */
function defaultConfigPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
	return join(xdg, "agent-mail", "config.toml");
}

/**
 * Resolve the config file path.
 *
 * Resolution order:
 * 1. Explicit `--config` flag
 * 2. `AGENT_MAIL_CONFIG` env var
 * 3. `~/.config/agent-mail/config.toml` (XDG default)
 */
export function resolveConfigPath(explicitPath?: string): string {
	if (explicitPath) return explicitPath;
	if (process.env.AGENT_MAIL_CONFIG) return process.env.AGENT_MAIL_CONFIG;
	return defaultConfigPath();
}

/** Read and parse a TOML config file, validate with Zod. */
export function loadConfig(path: string): MailConfig {
	if (!existsSync(path)) {
		throw new MailError("INVALID_INPUT", `Config file not found: ${path}`);
	}

	const raw = readFileSync(path, "utf-8");

	let parsed: unknown;
	try {
		parsed = Bun.TOML.parse(raw);
	} catch (err) {
		throw new MailError("INVALID_INPUT", `Failed to parse TOML: ${err}`, err);
	}

	const result = mailConfigSchema.safeParse(parsed);
	if (!result.success) {
		throw new MailError("INVALID_INPUT", `Invalid config: ${result.error.message}`);
	}
	return result.data;
}
