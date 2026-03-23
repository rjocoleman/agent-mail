import type { ImapFlow, MessageStructureObject } from "imapflow";
import {
	formatDate,
	formatFlags,
	formatNumber,
	formatSender,
	renderTable,
	truncate,
} from "../processing/format.js";
import type { ParsedListInput } from "../schemas.js";
import { type MailConfig, wrapImapError } from "../types.js";
import { fetchInBatches } from "./fetch-utils.js";

/** Check if a BODYSTRUCTURE has attachments (non-inline parts with filenames). */
function hasAttachments(bodyStructure: MessageStructureObject | undefined): boolean {
	if (!bodyStructure) return false;
	if (bodyStructure.disposition === "attachment") return true;
	if (bodyStructure.childNodes) {
		return bodyStructure.childNodes.some((child) => hasAttachments(child));
	}
	return false;
}

/**
 * List recent messages in a folder.
 * Returns a markdown table with UID, date, sender, subject, and flags.
 */
export async function list(
	client: ImapFlow,
	input: ParsedListInput,
	config: MailConfig,
): Promise<string> {
	// Fetch folder counts separately - non-fatal if the server rejects it
	let total = 0;
	let unseen = 0;
	let hasStatus = false;
	try {
		const status = await client.status(input.folder, {
			messages: true,
			unseen: true,
		});
		total = status.messages ?? 0;
		unseen = status.unseen ?? 0;
		hasStatus = true;
	} catch {
		// Some servers reject STATUS for certain folders
	}

	const lock = await client.getMailboxLock(input.folder);
	try {
		// Build search criteria
		const searchCriteria: Record<string, unknown> = {};
		if (input.unread_only) searchCriteria.unseen = true;
		if (input.since) searchCriteria.since = new Date(input.since);
		if (input.before) searchCriteria.before = new Date(input.before);
		if (input.from) searchCriteria.from = input.from;

		// Search for matching UIDs
		const hasFilters = Object.keys(searchCriteria).length > 0;
		let uids: number[];

		if (hasFilters) {
			const result = await client.search(searchCriteria, { uid: true });
			uids = result as number[];
		} else {
			const result = await client.search({ all: true }, { uid: true });
			uids = result as number[];
		}

		// Sort descending (most recent first) and apply pagination
		uids.sort((a, b) => b - a);

		// Use search result count if status() failed
		if (total === 0) total = uids.length;

		const paged = uids.slice(input.offset, input.offset + input.limit);

		if (paged.length === 0) {
			const heading = hasStatus
			? `# ${input.folder} (${formatNumber(unseen)} unread / ${formatNumber(total)} total)`
			: `# ${input.folder} (${formatNumber(total)} messages)`;
			return `${heading}\n\nNo messages found.`;
		}

		// Fetch envelopes for the selected UIDs
		const messages: {
			uid: number;
			date: Date | undefined;
			from: { name?: string; address?: string } | undefined;
			subject: string | undefined;
			flags: Set<string>;
			hasAttachment: boolean;
		}[] = [];

		const fetched = await fetchInBatches(client, paged, {
			envelope: true,
			flags: true,
			bodyStructure: true,
			uid: true,
		});
		for (const msg of fetched) {
			messages.push({
				uid: msg.uid,
				date: msg.envelope?.date,
				from: msg.envelope?.from?.[0],
				subject: msg.envelope?.subject,
				flags: msg.flags ?? new Set<string>(),
				hasAttachment: hasAttachments(msg.bodyStructure),
			});
		}

		// Sort by UID descending (most recent first)
		messages.sort((a, b) => b.uid - a.uid);

		// Build rows
		const rows = messages.map((msg, i) => {
			const date = msg.date ? formatDate(msg.date, config.timezone) : "";
			const from = formatSender(msg.from);
			const subject = truncate(msg.subject ?? "(no subject)", 60);
			const flags = formatFlags(msg.flags, msg.hasAttachment);

			return [String(input.offset + i + 1), String(msg.uid), date, from, subject, flags];
		});

		const heading = hasStatus
			? `# ${input.folder} (${formatNumber(unseen)} unread / ${formatNumber(total)} total)`
			: `# ${input.folder} (${formatNumber(total)} messages)`;
		const rangeStart = input.offset + 1;
		const rangeEnd = input.offset + messages.length;
		const resultTotal = hasFilters ? uids.length : total;
		const showing = `Showing ${rangeStart}-${rangeEnd} of ${formatNumber(resultTotal)}.`;
		const table = renderTable(["#", "UID", "Date", "From", "Subject", "Flags"], rows);
		const legend = "● = unread · 📎 = attachment · ⭐ = flagged";

		return `${heading}\n\n${showing}\n\n${table}\n\n${legend}`;
	} catch (err) {
		throw wrapImapError(err, `list ${input.folder}`);
	} finally {
		lock.release();
	}
}
