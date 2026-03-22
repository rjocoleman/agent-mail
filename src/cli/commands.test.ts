import { describe, expect, test } from "bun:test";
import { parseFlags } from "./commands.js";

describe("parseFlags", () => {
	test("parses command with no flags", () => {
		const { command, flags } = parseFlags(["folders"]);
		expect(command).toBe("folders");
		expect(Object.keys(flags)).toHaveLength(0);
	});

	test("parses command with string flags", () => {
		const { command, flags } = parseFlags(["list", "--folder", "Sent", "--limit", "10"]);
		expect(command).toBe("list");
		expect(flags.folder).toBe("Sent");
		expect(flags.limit).toBe("10");
	});

	test("parses boolean flags", () => {
		const { command, flags } = parseFlags(["list", "--unread"]);
		expect(command).toBe("list");
		expect(flags.unread).toBe(true);
	});

	test("parses mixed flags", () => {
		const { command, flags } = parseFlags([
			"get",
			"--uid",
			"18823",
			"--summary",
			"--folder",
			"INBOX",
			"--raw",
		]);
		expect(command).toBe("get");
		expect(flags.uid).toBe("18823");
		expect(flags.summary).toBe(true);
		expect(flags.folder).toBe("INBOX");
		expect(flags.raw).toBe(true);
	});

	test("parses short flags", () => {
		const { command, flags } = parseFlags([
			"attachment",
			"--uid",
			"1",
			"--part",
			"2",
			"-o",
			"out.pdf",
		]);
		expect(command).toBe("attachment");
		expect(flags.o).toBe("out.pdf");
	});

	test("handles global flags before command", () => {
		const { command, flags } = parseFlags(["--config", "/path/config.toml", "folders"]);
		expect(flags.config).toBe("/path/config.toml");
		expect(command).toBe("folders");
	});

	test("handles help flag with no command", () => {
		const { command, flags } = parseFlags(["--help"]);
		expect(command).toBe("");
		expect(flags.help).toBe(true);
	});

	test("handles version flag", () => {
		const { command, flags } = parseFlags(["--version"]);
		expect(command).toBe("");
		expect(flags.version).toBe(true);
	});

	test("handles empty args", () => {
		const { command, flags } = parseFlags([]);
		expect(command).toBe("");
		expect(Object.keys(flags)).toHaveLength(0);
	});

	test("search with multiple filters", () => {
		const { command, flags } = parseFlags([
			"search",
			"--query",
			"deploy",
			"--from",
			"alice@co.nz",
			"--since",
			"2026-01-01",
			"--unread",
			"--limit",
			"5",
		]);
		expect(command).toBe("search");
		expect(flags.query).toBe("deploy");
		expect(flags.from).toBe("alice@co.nz");
		expect(flags.since).toBe("2026-01-01");
		expect(flags.unread).toBe(true);
		expect(flags.limit).toBe("5");
	});
});
