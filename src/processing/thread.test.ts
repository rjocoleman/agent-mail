import { describe, expect, test } from "bun:test";
import {
	collectThreadIds,
	findMissingIds,
	parseReferences,
	sortChronologically,
} from "./thread.js";

describe("parseReferences", () => {
	test("parses space-separated message IDs", () => {
		const refs = "<abc@co.nz> <def@co.nz> <ghi@co.nz>";
		expect(parseReferences(refs)).toEqual(["<abc@co.nz>", "<def@co.nz>", "<ghi@co.nz>"]);
	});

	test("returns empty array for undefined", () => {
		expect(parseReferences(undefined)).toEqual([]);
	});

	test("returns empty array for empty string", () => {
		expect(parseReferences("")).toEqual([]);
	});

	test("handles single reference", () => {
		expect(parseReferences("<single@example.com>")).toEqual(["<single@example.com>"]);
	});
});

describe("collectThreadIds", () => {
	test("combines messageId, references, and inReplyTo", () => {
		const ids = collectThreadIds({
			messageId: "<msg1@co.nz>",
			references: "<root@co.nz> <msg1@co.nz>",
			inReplyTo: "<parent@co.nz>",
		});
		expect(ids).toContain("<msg1@co.nz>");
		expect(ids).toContain("<root@co.nz>");
		expect(ids).toContain("<parent@co.nz>");
	});

	test("deduplicates IDs", () => {
		const ids = collectThreadIds({
			messageId: "<same@co.nz>",
			references: "<same@co.nz>",
			inReplyTo: "<same@co.nz>",
		});
		expect(ids.length).toBe(1);
	});

	test("handles missing fields", () => {
		const ids = collectThreadIds({});
		expect(ids).toEqual([]);
	});
});

describe("findMissingIds", () => {
	test("finds IDs not in the found set", () => {
		const expected = ["<a@co.nz>", "<b@co.nz>", "<c@co.nz>"];
		const found = new Set(["<a@co.nz>", "<c@co.nz>"]);
		expect(findMissingIds(expected, found)).toEqual(["<b@co.nz>"]);
	});

	test("returns empty when all found", () => {
		const expected = ["<a@co.nz>"];
		const found = new Set(["<a@co.nz>"]);
		expect(findMissingIds(expected, found)).toEqual([]);
	});
});

describe("sortChronologically", () => {
	test("sorts by date ascending", () => {
		const messages = [
			{ date: new Date("2026-03-22"), label: "c" },
			{ date: new Date("2026-03-20"), label: "a" },
			{ date: new Date("2026-03-21"), label: "b" },
		];
		const sorted = sortChronologically(messages);
		expect(sorted.map((m) => m.label)).toEqual(["a", "b", "c"]);
	});

	test("puts messages without dates at the end", () => {
		const messages = [
			{ date: undefined, label: "no-date" },
			{ date: new Date("2026-03-20"), label: "with-date" },
		];
		const sorted = sortChronologically(messages);
		expect(sorted[0]?.label).toBe("with-date");
		expect(sorted[1]?.label).toBe("no-date");
	});

	test("does not mutate original array", () => {
		const messages = [
			{ date: new Date("2026-03-22"), label: "b" },
			{ date: new Date("2026-03-20"), label: "a" },
		];
		sortChronologically(messages);
		expect(messages[0]?.label).toBe("b");
	});
});
