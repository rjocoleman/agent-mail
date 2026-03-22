import { describe, expect, test } from "bun:test";
import { detectProvider, resolveFolder, reverseAliases } from "./index.js";

describe("detectProvider", () => {
	test("detects Gmail from folder paths", () => {
		const paths = ["INBOX", "[Gmail]/Sent Mail", "[Gmail]/Drafts", "[Gmail]/All Mail"];
		expect(detectProvider(paths, "imap.gmail.com")).toBe("gmail");
	});

	test("detects Gmail even with unknown host", () => {
		const paths = ["INBOX", "[Gmail]/Sent Mail"];
		expect(detectProvider(paths, "some.random.host")).toBe("gmail");
	});

	test("detects Fastmail from host", () => {
		const paths = ["INBOX", "Sent Items", "Archive"];
		expect(detectProvider(paths, "imap.fastmail.com")).toBe("fastmail");
	});

	test("detects Outlook from host", () => {
		const paths = ["INBOX", "Sent Items"];
		expect(detectProvider(paths, "outlook.office365.com")).toBe("outlook");
	});

	test("detects Outlook from outlook.com host", () => {
		const paths = ["INBOX"];
		expect(detectProvider(paths, "imap-mail.outlook.com")).toBe("outlook");
	});

	test("returns generic for unknown providers", () => {
		const paths = ["INBOX", "Sent"];
		expect(detectProvider(paths, "mail.example.com")).toBe("generic");
	});
});

describe("resolveFolder", () => {
	const gmailPaths = new Set([
		"INBOX",
		"[Gmail]/Sent Mail",
		"[Gmail]/Drafts",
		"[Gmail]/Trash",
		"[Gmail]/All Mail",
	]);

	test("returns exact IMAP path match as-is", () => {
		expect(resolveFolder("[Gmail]/Sent Mail", "gmail", gmailPaths)).toBe("[Gmail]/Sent Mail");
	});

	test("resolves alias to IMAP path", () => {
		expect(resolveFolder("Sent", "gmail", gmailPaths)).toBe("[Gmail]/Sent Mail");
		expect(resolveFolder("Archive", "gmail", gmailPaths)).toBe("[Gmail]/All Mail");
		expect(resolveFolder("Trash", "gmail", gmailPaths)).toBe("[Gmail]/Trash");
	});

	test("custom aliases take priority over provider aliases", () => {
		const custom = { Sent: "Custom/Sent" };
		expect(resolveFolder("Sent", "gmail", gmailPaths, custom)).toBe("Custom/Sent");
	});

	test("falls through to literal for unknown names", () => {
		expect(resolveFolder("SomeCustomFolder", "gmail", gmailPaths)).toBe("SomeCustomFolder");
	});

	test("INBOX always matches as exact path", () => {
		expect(resolveFolder("INBOX", "gmail", gmailPaths)).toBe("INBOX");
	});

	test("works for generic provider with no aliases", () => {
		const paths = new Set(["INBOX", "Sent"]);
		expect(resolveFolder("Sent", "generic", paths)).toBe("Sent");
		expect(resolveFolder("Archive", "generic", paths)).toBe("Archive");
	});

	test("resolves Fastmail aliases", () => {
		const paths = new Set(["INBOX", "Sent Items", "Archive", "Junk Mail"]);
		expect(resolveFolder("Sent", "fastmail", paths)).toBe("Sent Items");
		expect(resolveFolder("Spam", "fastmail", paths)).toBe("Junk Mail");
	});

	test("resolves Outlook aliases", () => {
		const paths = new Set(["INBOX", "Sent Items", "Deleted Items", "Junk Email"]);
		expect(resolveFolder("Sent", "outlook", paths)).toBe("Sent Items");
		expect(resolveFolder("Trash", "outlook", paths)).toBe("Deleted Items");
		expect(resolveFolder("Spam", "outlook", paths)).toBe("Junk Email");
	});
});

describe("reverseAliases", () => {
	test("builds reverse map for Gmail", () => {
		const reverse = reverseAliases("gmail");
		expect(reverse.get("[Gmail]/Sent Mail")).toBe("Sent");
		expect(reverse.get("[Gmail]/All Mail")).toBe("Archive");
	});

	test("includes custom aliases in reverse map", () => {
		const reverse = reverseAliases("generic", { Receipts: "INBOX.Receipts" });
		expect(reverse.get("INBOX.Receipts")).toBe("Receipts");
	});

	test("custom aliases override provider aliases in reverse", () => {
		const reverse = reverseAliases("gmail", { MySent: "[Gmail]/Sent Mail" });
		expect(reverse.get("[Gmail]/Sent Mail")).toBe("MySent");
	});

	test("returns empty map for generic with no custom", () => {
		const reverse = reverseAliases("generic");
		expect(reverse.size).toBe(0);
	});
});
