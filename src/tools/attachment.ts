import type { ImapFlow } from "imapflow";
import type { ParsedAttachmentInput } from "../schemas.js";
import { type AttachmentResult, MAX_ATTACHMENT_BYTES, MailError } from "../types.js";

/**
 * Download a specific attachment by UID and MIME part index.
 * Returns raw bytes - the one function that doesn't return markdown.
 */
export async function attachment(
	client: ImapFlow,
	input: ParsedAttachmentInput,
): Promise<AttachmentResult> {
	const lock = await client.getMailboxLock(input.folder);
	try {
		const download = await client.download(String(input.uid), input.part, { uid: true });

		if (!download) {
			throw new MailError(
				"NOT_FOUND",
				`Attachment part ${input.part} not found on UID ${input.uid}`,
			);
		}

		const chunks: Buffer[] = [];
		let totalSize = 0;

		for await (const chunk of download.content) {
			totalSize += chunk.length;
			if (totalSize > MAX_ATTACHMENT_BYTES) {
				throw new MailError(
					"TOO_LARGE",
					`Attachment exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit`,
				);
			}
			chunks.push(Buffer.from(chunk));
		}

		const content = Buffer.concat(chunks);

		return {
			filename: download.meta.filename ?? "attachment",
			mime_type: download.meta.contentType ?? "application/octet-stream",
			size: content.length,
			content,
		};
	} finally {
		lock.release();
	}
}
