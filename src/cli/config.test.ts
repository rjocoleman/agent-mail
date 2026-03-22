import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveConfigPath } from "./config.js";

describe("resolveConfigPath", () => {
	test("uses explicit path when provided", () => {
		expect(resolveConfigPath("/custom/path.toml")).toBe("/custom/path.toml");
	});

	test("uses AGENT_MAIL_CONFIG env var", () => {
		const original = process.env.AGENT_MAIL_CONFIG;
		process.env.AGENT_MAIL_CONFIG = "/env/config.toml";
		try {
			expect(resolveConfigPath()).toBe("/env/config.toml");
		} finally {
			if (original) {
				process.env.AGENT_MAIL_CONFIG = original;
			} else {
				delete process.env.AGENT_MAIL_CONFIG;
			}
		}
	});

	test("explicit path takes priority over env var", () => {
		const original = process.env.AGENT_MAIL_CONFIG;
		process.env.AGENT_MAIL_CONFIG = "/env/config.toml";
		try {
			expect(resolveConfigPath("/explicit.toml")).toBe("/explicit.toml");
		} finally {
			if (original) {
				process.env.AGENT_MAIL_CONFIG = original;
			} else {
				delete process.env.AGENT_MAIL_CONFIG;
			}
		}
	});

	test("falls back to XDG default path", () => {
		const original = process.env.AGENT_MAIL_CONFIG;
		delete process.env.AGENT_MAIL_CONFIG;
		try {
			const result = resolveConfigPath();
			expect(result).toContain("agent-mail");
			expect(result).toEndWith("config.toml");
		} finally {
			if (original) {
				process.env.AGENT_MAIL_CONFIG = original;
			}
		}
	});
});

describe("loadConfig", () => {
	function tmpConfig(content: string): string {
		const dir = mkdtempSync(join(tmpdir(), "agent-mail-test-"));
		const path = join(dir, "config.toml");
		writeFileSync(path, content);
		return path;
	}

	test("loads and validates a valid TOML config", () => {
		const path = tmpConfig(`
host = "imap.gmail.com"
port = 993
secure = true

[auth]
user = "alice@gmail.com"
pass = "secret"
`);
		const config = loadConfig(path);
		expect(config.host).toBe("imap.gmail.com");
		expect(config.port).toBe(993);
		expect(config.auth.user).toBe("alice@gmail.com");
		expect(config.timezone).toBe("UTC");
		expect(config.timeouts.connect).toBe(10_000);
	});

	test("loads custom timezone and timeouts", () => {
		const path = tmpConfig(`
host = "imap.fastmail.com"
port = 993
secure = true
timezone = "Pacific/Auckland"

[auth]
user = "bob@fastmail.com"
pass = "token"

[timeouts]
connect = 5000
command = 15000
`);
		const config = loadConfig(path);
		expect(config.timezone).toBe("Pacific/Auckland");
		expect(config.timeouts.connect).toBe(5000);
		expect(config.timeouts.command).toBe(15000);
	});

	test("loads folder aliases", () => {
		const path = tmpConfig(`
host = "imap.example.com"
port = 993
secure = true

[auth]
user = "test@example.com"
pass = "pass"

[folderAliases]
Receipts = "INBOX.Receipts"
Work = "INBOX.Projects.Work"
`);
		const config = loadConfig(path);
		expect(config.folderAliases).toEqual({
			Receipts: "INBOX.Receipts",
			Work: "INBOX.Projects.Work",
		});
	});

	test("throws for missing file", () => {
		expect(() => loadConfig("/nonexistent/config.toml")).toThrow("Config file not found");
	});

	test("throws for invalid TOML", () => {
		const path = tmpConfig("this is not valid [[[toml");
		expect(() => loadConfig(path)).toThrow("Failed to parse TOML");
	});

	test("throws for missing required fields", () => {
		const path = tmpConfig(`
host = "imap.example.com"
port = 993
`);
		expect(() => loadConfig(path)).toThrow("Invalid config");
	});

	test("throws for empty auth", () => {
		const path = tmpConfig(`
host = "imap.example.com"
port = 993
secure = true

[auth]
user = ""
pass = "x"
`);
		expect(() => loadConfig(path)).toThrow("Invalid config");
	});
});
