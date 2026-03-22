import { describe, expect, test } from "bun:test";
import {
	normaliseWhitespace,
	processBody,
	selectBody,
	stripQuotedReplies,
	stripSignature,
	truncateBody,
} from "./body.js";

describe("selectBody", () => {
	test("prefers text/plain when available", () => {
		expect(selectBody("plain text", "<p>html</p>")).toBe("plain text");
	});

	test("converts HTML to markdown when no plain text", () => {
		const result = selectBody(undefined, "<h1>Hello</h1><p>World</p>");
		expect(result).toContain("Hello");
		expect(result).toContain("World");
		expect(result).not.toContain("<h1>");
	});

	test("returns empty string when both are undefined", () => {
		expect(selectBody(undefined, undefined)).toBe("");
	});
});

describe("stripSignature", () => {
	test("strips standard -- delimiter", () => {
		const body = "Hello there.\n\nGood to hear from you.\n-- \nAlice\nalice@co.nz";
		const result = stripSignature(body);
		expect(result).toBe("Hello there.\n\nGood to hear from you.");
		expect(result).not.toContain("Alice");
	});

	test("strips --- delimiter", () => {
		const body = "Main content here.\n---\nSent from my phone";
		const result = stripSignature(body);
		expect(result).toBe("Main content here.");
	});

	test("strips sign-off phrases", () => {
		const body = "Let me know.\n\nCheers,\nBob\nSenior Engineer";
		const result = stripSignature(body);
		expect(result).toBe("Let me know.");
	});

	test("does not strip if signature block is too long", () => {
		const longSig = Array(15).fill("line").join("\n");
		const body = `Content here.\n-- \n${longSig}`;
		const result = stripSignature(body);
		expect(result).toBe(body);
	});

	test("preserves body with no signature", () => {
		const body = "Just a regular email body with no signature.";
		expect(stripSignature(body)).toBe(body);
	});
});

describe("stripQuotedReplies", () => {
	test("strips quoted lines", () => {
		const body = "My reply.\n\n> Previous message\n> continues here";
		const result = stripQuotedReplies(body);
		expect(result).toContain("My reply.");
		expect(result).toContain("[--- quoted reply removed ---]");
		expect(result).not.toContain("Previous message");
	});

	test("strips On ... wrote: preamble", () => {
		const body = "Thanks!\n\nOn Mon, 1 Jan 2026, Alice wrote:\n> Original message";
		const result = stripQuotedReplies(body);
		expect(result).toContain("Thanks!");
		expect(result).toContain("[--- quoted reply removed ---]");
		expect(result).not.toContain("Alice wrote");
	});

	test("preserves body with no quotes", () => {
		const body = "Clean message with no quotes.";
		expect(stripQuotedReplies(body)).toBe(body);
	});
});

describe("normaliseWhitespace", () => {
	test("collapses 3+ blank lines to 2", () => {
		const body = "Line 1\n\n\n\n\nLine 2";
		expect(normaliseWhitespace(body)).toBe("Line 1\n\nLine 2");
	});

	test("trims leading and trailing whitespace", () => {
		expect(normaliseWhitespace("  \n\nhello\n\n  ")).toBe("hello");
	});

	test("preserves double newlines", () => {
		const body = "Para 1\n\nPara 2";
		expect(normaliseWhitespace(body)).toBe(body);
	});
});

describe("truncateBody", () => {
	test("returns empty string when maxChars is 0", () => {
		expect(truncateBody("some content", 0)).toBe("");
	});

	test("returns full body when maxChars is -1", () => {
		const body = "full body content here";
		expect(truncateBody(body, -1)).toBe(body);
	});

	test("returns body unchanged when within limit", () => {
		const body = "short";
		expect(truncateBody(body, 100)).toBe(body);
	});

	test("truncates and adds notice when exceeding limit", () => {
		const body = "a".repeat(200);
		const result = truncateBody(body, 100);
		expect(result).toContain("a".repeat(100));
		expect(result).toContain("[--- truncated at");
		expect(result).toContain("full message is");
	});
});

describe("processBody", () => {
	test("runs full pipeline", () => {
		const text = "Reply content.\n\n> Quoted text\n\nCheers,\nAlice\nalice@co.nz";
		const result = processBody(text, undefined);
		expect(result).toContain("Reply content.");
		expect(result).toContain("[--- quoted reply removed ---]");
		expect(result).not.toContain("Cheers,");
	});

	test("includes quoted when requested", () => {
		const text = "Reply.\n\n> Quoted text here";
		const result = processBody(text, undefined, { includeQuoted: true });
		expect(result).toContain("> Quoted text here");
	});

	test("respects max_body_chars", () => {
		const text = "a".repeat(500);
		const result = processBody(text, undefined, { maxBodyChars: 100 });
		expect(result).toContain("[--- truncated at");
	});

	test("omits body when max_body_chars is 0", () => {
		const result = processBody("some body", undefined, { maxBodyChars: 0 });
		expect(result).toBe("");
	});
});
