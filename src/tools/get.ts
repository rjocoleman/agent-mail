import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { extractAttachments } from "../processing/attachments.js";
import { processBody } from "../processing/body.js";
import {
	formatDateWithTz,
	formatSender,
	renderAttachments,
	renderMetadataTable,
} from "../processing/format.js";
import { summarise } from "../processing/summary.js";
import type { ParsedGetInput } from "../schemas.js";
import type { MailConfig } from "../types.js";
import { MailError } from "../types.js";

/**
 * Fetch a single message by UID.
 * Returns a markdown document with metadata, optional summary, body, and attachments.
 */
export async function get(
	client: ImapFlow,
	input: ParsedGetInput,
	config: MailConfig,
): Promise<string> {
	const lock = await client.getMailboxLock(input.folder);
	try {
		const msg = await client.fetchOne(
			String(input.uid),
			{
				source: true,
				envelope: true,
				flags: true,
				bodyStructure: true,
			},
			{ uid: true },
		);

		if (!msg) {
			throw new MailError("NOT_FOUND", `Message UID ${input.uid} not found in ${input.folder}`);
		}

		if (!msg.source) {
			throw new MailError("NOT_FOUND", `Message source unavailable for UID ${input.uid}`);
		}

		const envelope = msg.envelope;
		if (!envelope) {
			throw new MailError("NOT_FOUND", `Message envelope unavailable for UID ${input.uid}`);
		}

		// Raw mode: return the RFC 2822 source as-is
		if (input.raw) {
			return msg.source.toString();
		}

		const parsed = await simpleParser(msg.source, {});

		// Build metadata fields
		const fields: { label: string; value: string }[] = [
			{ label: "From", value: formatSender(envelope.from?.[0], 80) },
		];

		if (envelope.to?.length) {
			fields.push({
				label: "To",
				value: envelope.to.map((a) => formatSender(a, 80)).join(", "),
			});
		}

		if (envelope.cc?.length) {
			fields.push({
				label: "CC",
				value: envelope.cc.map((a) => formatSender(a, 80)).join(", "),
			});
		}

		fields.push({
			label: "Date",
			value: envelope.date ? formatDateWithTz(envelope.date, config.timezone) : "(unknown)",
		});

		if (input.include_headers && envelope.messageId) {
			fields.push({ label: "Message-ID", value: envelope.messageId });
		}

		fields.push({ label: "UID", value: String(input.uid) });
		fields.push({ label: "Folder", value: input.folder });

		const metadataTable = renderMetadataTable(fields);

		// Process body
		const body = processBody(parsed.text ?? undefined, parsed.html || undefined, {
			includeQuoted: input.include_quoted,
			maxBodyChars: input.max_body_chars,
		});

		// Summary
		let summaryBlock = "";
		if (input.summary_first) {
			const fullBody = processBody(parsed.text ?? undefined, parsed.html || undefined, {
				includeQuoted: input.include_quoted,
				maxBodyChars: -1,
			});
			const summaryText = await summarise(fullBody, input.summarise, config.summarise);
			summaryBlock = `\n> **Summary:** ${summaryText}\n`;
		}

		// Attachments
		const attachments = extractAttachments(msg.bodyStructure);
		const attachmentBlock = renderAttachments(attachments);

		// Assemble
		const subject = envelope.subject ?? "(no subject)";
		const parts = [`# ${subject}`];

		if (summaryBlock) parts.push(summaryBlock);
		parts.push(metadataTable);

		if (body) {
			parts.push("---");
			parts.push(body);
		}

		if (attachmentBlock) {
			parts.push("---");
			parts.push(attachmentBlock);
		}

		return parts.join("\n\n");
	} finally {
		lock.release();
	}
}
