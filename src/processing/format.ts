/**
 * Markdown formatting utilities for email output.
 * All public API functions return markdown strings, so consistent
 * table and metadata rendering matters.
 */

/** Format a number with commas (e.g. 1,204). */
export function formatNumber(n: number): string {
	return n.toLocaleString("en-NZ");
}

/** Truncate a string to maxLen, appending ellipsis if truncated. */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen - 3)}...`;
}

/**
 * Format a Date to a readable string in the given timezone.
 * Output: "2026-03-22 09:14"
 */
export function formatDate(date: Date, timezone: string): string {
	return date
		.toLocaleString("en-NZ", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		})
		.replace(",", "");
}

/**
 * Format a Date with timezone abbreviation for detailed views.
 * Output: "2026-03-22 09:14 NZDT"
 */
export function formatDateWithTz(date: Date, timezone: string): string {
	const base = formatDate(date, timezone);

	// Extract timezone abbreviation
	const parts = new Intl.DateTimeFormat("en-NZ", {
		timeZone: timezone,
		timeZoneName: "short",
	}).formatToParts(date);

	const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
	return `${base} ${tzName}`;
}

/** Format bytes to a human-readable string (e.g. "42 KB", "1.2 MB"). */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format a sender address for display.
 * Input: { name: "Alice", address: "alice@co.nz" }
 * Output: "Alice <alice@co.nz>" (truncated to maxLen)
 */
export function formatSender(
	sender: { name?: string; address?: string } | undefined,
	maxLen = 40,
): string {
	if (!sender) return "(unknown)";
	const { name, address } = sender;
	if (name && address) return truncate(`${name} <${address}>`, maxLen);
	return truncate(address ?? name ?? "(unknown)", maxLen);
}

/**
 * Build flag indicators for a message listing row.
 * Returns a compact string like "●", "📎", "⭐", or combinations.
 */
export function formatFlags(flags: Set<string>, hasAttachment: boolean): string {
	const parts: string[] = [];
	if (!flags.has("\\Seen")) parts.push("●");
	if (hasAttachment) parts.push("📎");
	if (flags.has("\\Flagged")) parts.push("⭐");
	return parts.join(" ");
}

/**
 * Render a markdown table from headers and rows.
 * Supports right-aligned columns via a `rightAlign` set of column indices.
 */
export function renderTable(headers: string[], rows: string[][], rightAlign?: Set<number>): string {
	const separator = headers.map((_, i) => (rightAlign?.has(i) ? "---:" : "---"));
	const lines = [
		`| ${headers.join(" | ")} |`,
		`|${separator.join("|")}|`,
		...rows.map((row) => `| ${row.join(" | ")} |`),
	];
	return lines.join("\n");
}

/**
 * Render the metadata table for a single message view.
 * Shows From, To, CC, Date, Message-ID, UID, Folder.
 */
export function renderMetadataTable(fields: { label: string; value: string }[]): string {
	return renderTable(
		["Field", "Value"],
		fields.map((f) => [f.label, f.value]),
	);
}

/**
 * Render an attachment listing block.
 * Each entry: `filename` (size) - mime_type [part N]
 */
export function renderAttachments(
	attachments: { filename: string; size: number; mimeType: string; part: string }[],
	messagePrefix?: string,
): string {
	if (attachments.length === 0) return "";
	const lines = attachments.map((a) => {
		const prefix = messagePrefix ? `${messagePrefix} ` : "";
		return `- ${prefix}\`${a.filename}\` (${formatBytes(a.size)}) - ${a.mimeType} [part ${a.part}]`;
	});
	return `**Attachments:**\n\n${lines.join("\n")}`;
}
