import { describe, expect, test } from "bun:test";
import { fallbackSummarise, summarise } from "./summary.js";

describe("fallbackSummarise", () => {
	test("extracts first paragraph", () => {
		const body = "First paragraph here.\n\nSecond paragraph with more detail.";
		expect(fallbackSummarise(body)).toBe("First paragraph here.");
	});

	test("truncates long first paragraph to 300 chars", () => {
		const body = "a".repeat(400);
		const result = fallbackSummarise(body);
		expect(result.length).toBe(300);
		expect(result).toEndWith("...");
	});

	test("skips empty paragraphs", () => {
		const body = "\n\n\nActual content here.";
		expect(fallbackSummarise(body)).toBe("Actual content here.");
	});

	test("returns empty string for empty body", () => {
		expect(fallbackSummarise("")).toBe("");
		expect(fallbackSummarise("   ")).toBe("");
	});
});

describe("summarise", () => {
	test("uses per-call summariser when provided", async () => {
		const callFn = async (_body: string) => "call summary";
		const configFn = async (_body: string) => "config summary";
		const result = await summarise("body text", callFn, configFn);
		expect(result).toBe("call summary");
	});

	test("uses config summariser when no per-call override", async () => {
		const configFn = async (_body: string) => "config summary";
		const result = await summarise("body text", undefined, configFn);
		expect(result).toBe("config summary");
	});

	test("falls back to deterministic summariser", async () => {
		const result = await summarise("Deterministic first paragraph.\n\nMore details.");
		expect(result).toBe("Deterministic first paragraph.");
	});
});
