import { describe, expect, test } from "bun:test";
import {
	formatBytes,
	formatDate,
	formatDateWithTz,
	formatFlags,
	formatNumber,
	formatSender,
	renderAttachments,
	renderTable,
	truncate,
} from "./format.js";

describe("formatNumber", () => {
	test("formats small numbers", () => {
		expect(formatNumber(42)).toBe("42");
	});

	test("formats large numbers with commas", () => {
		const result = formatNumber(14882);
		// Locale-dependent, but should contain separator
		expect(result).toMatch(/14.?882/);
	});
});

describe("truncate", () => {
	test("returns short strings unchanged", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	test("truncates with ellipsis", () => {
		const result = truncate("a very long string here", 10);
		expect(result.length).toBe(10);
		expect(result).toEndWith("...");
	});
});

describe("formatDate", () => {
	test("formats date in UTC", () => {
		const date = new Date("2026-03-22T09:14:00Z");
		const result = formatDate(date, "UTC");
		expect(result).toContain("2026");
		expect(result).toContain("09");
		expect(result).toContain("14");
	});
});

describe("formatDateWithTz", () => {
	test("includes timezone abbreviation", () => {
		const date = new Date("2026-03-22T09:14:00Z");
		const result = formatDateWithTz(date, "Pacific/Auckland");
		expect(result).toContain("NZDT");
	});
});

describe("formatBytes", () => {
	test("formats bytes", () => {
		expect(formatBytes(500)).toBe("500 B");
	});

	test("formats kilobytes", () => {
		expect(formatBytes(42 * 1024)).toBe("42 KB");
	});

	test("formats megabytes", () => {
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
	});
});

describe("formatSender", () => {
	test("formats name and address", () => {
		expect(formatSender({ name: "Alice", address: "alice@co.nz" })).toBe("Alice <alice@co.nz>");
	});

	test("formats address only", () => {
		expect(formatSender({ address: "alice@co.nz" })).toBe("alice@co.nz");
	});

	test("returns (unknown) for undefined", () => {
		expect(formatSender(undefined)).toBe("(unknown)");
	});

	test("truncates long senders", () => {
		const result = formatSender(
			{ name: "Very Long Name Here", address: "very.long.address@example.com" },
			30,
		);
		expect(result.length).toBe(30);
	});
});

describe("formatFlags", () => {
	test("shows unread indicator for unseen messages", () => {
		expect(formatFlags(new Set(), false)).toBe("●");
	});

	test("shows no unread for seen messages", () => {
		expect(formatFlags(new Set(["\\Seen"]), false)).toBe("");
	});

	test("shows attachment indicator", () => {
		expect(formatFlags(new Set(["\\Seen"]), true)).toBe("📎");
	});

	test("shows flagged indicator", () => {
		expect(formatFlags(new Set(["\\Seen", "\\Flagged"]), false)).toBe("⭐");
	});

	test("combines multiple flags", () => {
		const result = formatFlags(new Set(["\\Flagged"]), true);
		expect(result).toContain("●");
		expect(result).toContain("📎");
		expect(result).toContain("⭐");
	});
});

describe("renderTable", () => {
	test("renders a basic table", () => {
		const result = renderTable(
			["Name", "Age"],
			[
				["Alice", "30"],
				["Bob", "25"],
			],
		);
		expect(result).toContain("| Name | Age |");
		expect(result).toContain("|---|---|");
		expect(result).toContain("| Alice | 30 |");
	});

	test("supports right-aligned columns", () => {
		const result = renderTable(["Name", "Count"], [["A", "1"]], new Set([1]));
		expect(result).toContain("|---:|");
	});
});

describe("renderAttachments", () => {
	test("renders attachment list", () => {
		const result = renderAttachments([
			{ filename: "doc.pdf", size: 42000, mimeType: "application/pdf", part: "2" },
		]);
		expect(result).toContain("**Attachments:**");
		expect(result).toContain("`doc.pdf`");
		expect(result).toContain("41 KB");
		expect(result).toContain("[part 2]");
	});

	test("returns empty string for no attachments", () => {
		expect(renderAttachments([])).toBe("");
	});

	test("includes message prefix when provided", () => {
		const result = renderAttachments(
			[{ filename: "file.txt", size: 100, mimeType: "text/plain", part: "1" }],
			"[2/4]",
		);
		expect(result).toContain("[2/4]");
	});
});
