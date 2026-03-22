import type { MessageStructureObject } from "imapflow";

export interface AttachmentInfo {
	filename: string;
	size: number;
	mimeType: string;
	part: string;
}

/** Extract attachment metadata from a BODYSTRUCTURE tree recursively. */
export function extractAttachments(
	node: MessageStructureObject | undefined,
	partPath = "",
): AttachmentInfo[] {
	if (!node) return [];

	const results: AttachmentInfo[] = [];

	if (node.childNodes) {
		for (let i = 0; i < node.childNodes.length; i++) {
			const child = node.childNodes[i];
			if (!child) continue;
			const childPath = partPath ? `${partPath}.${i + 1}` : String(i + 1);
			results.push(...extractAttachments(child, childPath));
		}
	} else {
		const isTextPart = node.type?.startsWith("text/") ?? false;
		const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
		if (node.disposition === "attachment" || (filename && !isTextPart)) {
			results.push({
				filename: filename ?? "attachment",
				size: node.size ?? 0,
				mimeType: node.type ?? "application/octet-stream",
				part: partPath || node.part || "1",
			});
		}
	}

	return results;
}
