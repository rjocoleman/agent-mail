import { describe, expect, test } from "bun:test";
import {
	attachmentInputSchema,
	getInputSchema,
	listInputSchema,
	mailConfigSchema,
	searchInputSchema,
	threadInputSchema,
} from "./schemas.js";
import { MailError } from "./types.js";

describe("mailConfigSchema", () => {
	const validConfig = {
		host: "imap.example.com",
		port: 993,
		secure: true,
		auth: { user: "alice@example.com", pass: "secret" },
	};

	test("accepts a minimal valid config", () => {
		const result = mailConfigSchema.parse(validConfig);
		expect(result.host).toBe("imap.example.com");
		expect(result.timezone).toBe("UTC");
		expect(result.timeouts.connect).toBe(10_000);
		expect(result.timeouts.command).toBe(30_000);
		expect(result.timeouts.search).toBe(60_000);
	});

	test("applies defaults for optional fields", () => {
		const result = mailConfigSchema.parse(validConfig);
		expect(result.timezone).toBe("UTC");
		expect(result.timeouts).toEqual({
			connect: 10_000,
			command: 30_000,
			search: 60_000,
		});
	});

	test("accepts custom timeouts", () => {
		const result = mailConfigSchema.parse({
			...validConfig,
			timeouts: { connect: 5_000 },
		});
		expect(result.timeouts.connect).toBe(5_000);
		expect(result.timeouts.command).toBe(30_000);
	});

	test("accepts custom timezone", () => {
		const result = mailConfigSchema.parse({
			...validConfig,
			timezone: "Pacific/Auckland",
		});
		expect(result.timezone).toBe("Pacific/Auckland");
	});

	test("accepts folder aliases", () => {
		const result = mailConfigSchema.parse({
			...validConfig,
			folderAliases: { Receipts: "INBOX.Receipts" },
		});
		expect(result.folderAliases).toEqual({ Receipts: "INBOX.Receipts" });
	});

	test("rejects missing host", () => {
		expect(() => mailConfigSchema.parse({ ...validConfig, host: "" })).toThrow();
	});

	test("rejects missing auth user", () => {
		expect(() =>
			mailConfigSchema.parse({ ...validConfig, auth: { user: "", pass: "x" } }),
		).toThrow();
	});

	test("rejects negative port", () => {
		expect(() => mailConfigSchema.parse({ ...validConfig, port: -1 })).toThrow();
	});

	test("rejects non-integer port", () => {
		expect(() => mailConfigSchema.parse({ ...validConfig, port: 99.5 })).toThrow();
	});
});

describe("listInputSchema", () => {
	test("applies defaults", () => {
		const result = listInputSchema.parse({});
		expect(result.folder).toBe("INBOX");
		expect(result.limit).toBe(20);
		expect(result.offset).toBe(0);
		expect(result.unread_only).toBe(false);
	});

	test("clamps limit to max 50", () => {
		expect(() => listInputSchema.parse({ limit: 51 })).toThrow();
	});

	test("accepts valid filters", () => {
		const result = listInputSchema.parse({
			folder: "Sent",
			limit: 10,
			unread_only: true,
			since: "2026-01-01",
			from: "alice@co.nz",
		});
		expect(result.folder).toBe("Sent");
		expect(result.unread_only).toBe(true);
	});
});

describe("getInputSchema", () => {
	test("requires uid", () => {
		expect(() => getInputSchema.parse({})).toThrow();
	});

	test("applies defaults", () => {
		const result = getInputSchema.parse({ uid: 123 });
		expect(result.folder).toBe("INBOX");
		expect(result.raw).toBe(false);
		expect(result.max_body_chars).toBe(8_000);
		expect(result.include_quoted).toBe(false);
		expect(result.summary_first).toBe(false);
	});

	test("rejects non-positive uid", () => {
		expect(() => getInputSchema.parse({ uid: 0 })).toThrow();
		expect(() => getInputSchema.parse({ uid: -1 })).toThrow();
	});
});

describe("threadInputSchema", () => {
	test("applies defaults with lower body char limit", () => {
		const result = threadInputSchema.parse({ uid: 100 });
		expect(result.max_body_chars).toBe(4_000);
		expect(result.folder).toBe("INBOX");
	});
});

describe("searchInputSchema", () => {
	test("applies defaults", () => {
		const result = searchInputSchema.parse({});
		expect(result.folder).toBe("INBOX");
		expect(result.limit).toBe(10);
		expect(result.unread_only).toBe(false);
		expect(result.flagged_only).toBe(false);
	});

	test("accepts wildcard folder", () => {
		const result = searchInputSchema.parse({ folder: "*" });
		expect(result.folder).toBe("*");
	});
});

describe("attachmentInputSchema", () => {
	test("requires uid and part", () => {
		expect(() => attachmentInputSchema.parse({})).toThrow();
		expect(() => attachmentInputSchema.parse({ uid: 1 })).toThrow();
	});

	test("applies folder default", () => {
		const result = attachmentInputSchema.parse({ uid: 1, part: "2" });
		expect(result.folder).toBe("INBOX");
	});
});

describe("MailError", () => {
	test("stores code and message", () => {
		const err = new MailError("CONNECTION", "can't connect");
		expect(err.code).toBe("CONNECTION");
		expect(err.message).toBe("can't connect");
		expect(err.name).toBe("MailError");
	});

	test("stores cause", () => {
		const cause = new Error("original");
		const err = new MailError("AUTH", "bad creds", cause);
		expect(err.cause).toBe(cause);
	});

	test("is an instance of Error", () => {
		const err = new MailError("TIMEOUT", "took too long");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(MailError);
	});
});
