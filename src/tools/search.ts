import type { ImapFlow, MessageStructureObject } from "imapflow";
import {
	formatDate,
	formatFlags,
	formatNumber,
	formatSender,
	renderTable,
	truncate,
} from "../processing/format.js";
import type { ParsedSearchInput } from "../schemas.js";
import type { MailConfig } from "../types.js";

/** Check if a BODYSTRUCTURE has attachments. */
function hasAttachments(bodyStructure: MessageStructureObject | undefined): boolean {
	if (!bodyStructure) return false;
	if (bodyStructure.disposition === "attachment") return true;
	if (bodyStructure.childNodes) {
		return bodyStructure.childNodes.some((child) => hasAttachments(child));
	}
	return false;
}

/** Build IMAP search criteria from SearchInput. */
function buildCriteria(input: ParsedSearchInput): Record<string, unknown> {
	const criteria: Record<string, unknown> = {};
	if (input.query) criteria.body = input.query;
	if (input.from) criteria.from = input.from;
	if (input.to) criteria.to = input.to;
	if (input.subject) criteria.subject = input.subject;
	if (input.since) criteria.since = new Date(input.since);
	if (input.before) criteria.before = new Date(input.before);
	if (input.unread_only) criteria.unseen = true;
	if (input.flagged_only) criteria.flagged = true;

	if (Object.keys(criteria).length === 0) criteria.all = true;

	return criteria;
}

/** Build the query description string for the heading. */
function describeQuery(input: ParsedSearchInput): string {
	const parts: string[] = [];
	if (input.query) parts.push(`\`${input.query}\``);
	if (input.from) parts.push(`from:${input.from}`);
	if (input.to) parts.push(`to:${input.to}`);
	if (input.subject) parts.push(`subject:${input.subject}`);
	if (input.since) parts.push(`since:${input.since}`);
	if (input.before) parts.push(`before:${input.before}`);
	if (input.unread_only) parts.push("unread");
	if (input.flagged_only) parts.push("flagged");
	return parts.join(" ") || "all";
}

/** Fetch messages for a single folder search. */
async function searchFolder(
	client: ImapFlow,
	folder: string,
	input: ParsedSearchInput,
	config: MailConfig,
	includeFolder: boolean,
): Promise<{ rows: string[][]; count: number }> {
	const lock = await client.getMailboxLock(folder);
	try {
		const criteria = buildCriteria(input);
		const uids = (await client.search(criteria, { uid: true })) as number[];

		uids.sort((a, b) => b - a);

		// When filtering by has_attachment post-fetch, fetch more to compensate
		const fetchLimit = input.has_attachment !== undefined ? uids.length : input.limit;
		const limited = uids.slice(0, fetchLimit);

		if (limited.length === 0) return { rows: [], count: 0 };

		const messages: {
			uid: number;
			date: Date | undefined;
			from: { name?: string; address?: string } | undefined;
			subject: string | undefined;
			flags: Set<string>;
			hasAttachment: boolean;
		}[] = [];

		for await (const msg of client.fetch(limited.join(","), {
			envelope: true,
			flags: true,
			bodyStructure: true,
			uid: true,
		})) {
			messages.push({
				uid: msg.uid,
				date: msg.envelope?.date,
				from: msg.envelope?.from?.[0],
				subject: msg.envelope?.subject,
				flags: msg.flags ?? new Set<string>(),
				hasAttachment: hasAttachments(msg.bodyStructure),
			});
		}

		messages.sort((a, b) => b.uid - a.uid);

		// Filter by has_attachment post-fetch, then apply limit
		const filtered =
			input.has_attachment !== undefined
				? messages.filter((m) => m.hasAttachment === input.has_attachment)
				: messages;
		const sliced = filtered.slice(0, input.limit);

		const rows = sliced.map((msg, i) => {
			const date = msg.date ? formatDate(msg.date, config.timezone) : "";
			const from = formatSender(msg.from);
			const subject = truncate(msg.subject ?? "(no subject)", 60);
			const flags = formatFlags(msg.flags, msg.hasAttachment);

			const row = [String(i + 1), String(msg.uid)];
			if (includeFolder) row.push(folder);
			row.push(date, from, subject, flags);
			return row;
		});

		return { rows, count: filtered.length };
	} finally {
		lock.release();
	}
}

// Folders to skip when searching all folders
const SKIP_FOLDERS = new Set([
	"Trash",
	"Drafts",
	"Spam",
	"Junk",
	"Junk Mail",
	"Junk Email",
	"Deleted Items",
]);

/**
 * Full-text and structured search.
 * Supports single folder or all folders (folder: "*").
 */
export async function search(
	client: ImapFlow,
	input: ParsedSearchInput,
	config: MailConfig,
): Promise<string> {
	const isMultiFolder = input.folder === "*";
	const queryDesc = describeQuery(input);

	if (!isMultiFolder) {
		const { rows, count } = await searchFolder(client, input.folder, input, config, false);
		const headers = ["#", "UID", "Date", "From", "Subject", "Flags"];
		const heading = `# Search: ${input.folder}`;
		const meta = `**Query:** ${queryDesc}\n**Matched:** ${formatNumber(count)} messages`;

		if (rows.length === 0) {
			return `${heading}\n\n${meta}\n\nNo messages found.`;
		}

		const table = renderTable(headers, rows);
		const legend = "● = unread · 📎 = attachment · ⭐ = flagged";
		return `${heading}\n\n${meta}\n\n${table}\n\n${legend}`;
	}

	// Multi-folder search
	const tree = await client.list();
	const searchableFolders = tree
		.map((f) => f.path)
		.filter(
			(p) =>
				!SKIP_FOLDERS.has(p) &&
				!p.startsWith("[Gmail]/Trash") &&
				!p.startsWith("[Gmail]/Spam") &&
				!p.startsWith("[Gmail]/Drafts"),
		);

	let allRows: string[][] = [];
	let totalCount = 0;

	// Higher per-folder limit so the global slice gets a fair pool, capped at 50
	const multiFolderInput = { ...input, limit: Math.min(input.limit * 3, 50) };
	for (const folder of searchableFolders) {
		const { rows, count } = await searchFolder(client, folder, multiFolderInput, config, true);
		allRows.push(...rows);
		totalCount += count;
	}

	// Re-number and limit
	allRows = allRows.slice(0, input.limit).map((row, i) => {
		row[0] = String(i + 1);
		return row;
	});

	const headers = ["#", "UID", "Folder", "Date", "From", "Subject", "Flags"];
	const heading = "# Search: All Folders";
	const searchedList = searchableFolders.join(", ");
	const meta = `**Query:** ${queryDesc}\n**Searched:** ${searchedList} (${searchableFolders.length} folders)\n**Matched:** ${formatNumber(totalCount)} messages`;

	if (allRows.length === 0) {
		return `${heading}\n\n${meta}\n\nNo messages found.`;
	}

	const table = renderTable(headers, allRows);
	const legend = "● = unread · 📎 = attachment · ⭐ = flagged";

	const parts = [`${heading}\n\n${meta}\n\n${table}\n\n${legend}`];
	if (searchableFolders.length > 5) {
		parts.push(
			`> **Note:** searched ${searchableFolders.length} folders. Results may be slow for large mailboxes.`,
		);
	}

	return parts.join("\n\n");
}
