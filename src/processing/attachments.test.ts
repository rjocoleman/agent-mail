import { describe, expect, test } from "bun:test";
import type { MessageStructureObject } from "imapflow";
import { extractAttachments } from "./attachments.js";

describe("extractAttachments", () => {
	test("returns empty for undefined node", () => {
		expect(extractAttachments(undefined)).toEqual([]);
	});

	test("returns empty for plain text node", () => {
		const node: MessageStructureObject = {
			type: "text/plain",
			parameters: { charset: "utf-8" },
			size: 100,
		};
		expect(extractAttachments(node)).toEqual([]);
	});

	test("extracts attachment with disposition", () => {
		const node: MessageStructureObject = {
			type: "application/pdf",
			disposition: "attachment",
			dispositionParameters: { filename: "report.pdf" },
			size: 42000,
			part: "2",
		};
		expect(extractAttachments(node)).toEqual([
			{ filename: "report.pdf", size: 42000, mimeType: "application/pdf", part: "2" },
		]);
	});

	test("extracts attachment from multipart tree", () => {
		const node: MessageStructureObject = {
			type: "multipart/mixed",
			childNodes: [
				{ type: "text/plain", size: 100 },
				{
					type: "application/pdf",
					disposition: "attachment",
					dispositionParameters: { filename: "doc.pdf" },
					size: 5000,
					part: "2",
				},
			],
		};
		const result = extractAttachments(node);
		expect(result).toHaveLength(1);
		expect(result[0]?.filename).toBe("doc.pdf");
	});

	test("extracts from deeply nested multipart", () => {
		const node: MessageStructureObject = {
			type: "multipart/mixed",
			childNodes: [
				{
					type: "multipart/alternative",
					childNodes: [
						{ type: "text/plain", size: 50 },
						{ type: "text/html", size: 200 },
					],
				},
				{
					type: "image/png",
					disposition: "attachment",
					dispositionParameters: { filename: "screenshot.png" },
					size: 80000,
					part: "3",
				},
			],
		};
		const result = extractAttachments(node);
		expect(result).toHaveLength(1);
		expect(result[0]?.filename).toBe("screenshot.png");
	});

	test("does not treat inline text with name as attachment", () => {
		const node: MessageStructureObject = {
			type: "text/html",
			parameters: { name: "body.html" },
			size: 500,
		};
		expect(extractAttachments(node)).toEqual([]);
	});

	test("uses parameters.name as fallback filename", () => {
		const node: MessageStructureObject = {
			type: "application/octet-stream",
			disposition: "attachment",
			parameters: { name: "data.bin" },
			size: 1000,
			part: "1",
		};
		const result = extractAttachments(node);
		expect(result[0]?.filename).toBe("data.bin");
	});

	test("uses default filename when none available", () => {
		const node: MessageStructureObject = {
			type: "application/octet-stream",
			disposition: "attachment",
			size: 1000,
			part: "1",
		};
		const result = extractAttachments(node);
		expect(result[0]?.filename).toBe("attachment");
	});

	test("generates part paths for child nodes", () => {
		const node: MessageStructureObject = {
			type: "multipart/mixed",
			childNodes: [
				{ type: "text/plain", size: 50 },
				{
					type: "image/jpeg",
					disposition: "attachment",
					dispositionParameters: { filename: "photo.jpg" },
					size: 30000,
				},
			],
		};
		const result = extractAttachments(node);
		expect(result[0]?.part).toBe("2");
	});

	test("handles multiple attachments", () => {
		const node: MessageStructureObject = {
			type: "multipart/mixed",
			childNodes: [
				{ type: "text/plain", size: 50 },
				{
					type: "application/pdf",
					disposition: "attachment",
					dispositionParameters: { filename: "a.pdf" },
					size: 1000,
				},
				{
					type: "application/zip",
					disposition: "attachment",
					dispositionParameters: { filename: "b.zip" },
					size: 2000,
				},
			],
		};
		const result = extractAttachments(node);
		expect(result).toHaveLength(2);
		expect(result[0]?.filename).toBe("a.pdf");
		expect(result[1]?.filename).toBe("b.zip");
	});

	test("skips null child nodes gracefully", () => {
		const node: MessageStructureObject = {
			type: "multipart/mixed",
			childNodes: [{ type: "text/plain", size: 50 }],
		};
		// Force an undefined entry to simulate edge case
		node.childNodes!.push(undefined as unknown as MessageStructureObject);
		expect(() => extractAttachments(node)).not.toThrow();
	});
});
