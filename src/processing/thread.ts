/**
 * Thread reconstruction utilities.
 * Parses References and In-Reply-To headers to find related messages,
 * then correlates them into a chronological thread.
 */

/**
 * Parse a References header into an array of message IDs.
 * Handles string (space-separated), array, or other types from mailparser.
 * e.g. "<abc@co.nz> <def@co.nz>" -> ["<abc@co.nz>", "<def@co.nz>"]
 */
export function parseReferences(header: unknown): string[] {
	if (!header) return [];
	if (Array.isArray(header)) return header.filter((h): h is string => typeof h === "string");
	if (typeof header !== "string") return [];
	const matches = header.match(/<[^>]+>/g);
	return matches ?? [];
}

/**
 * Collect all message IDs that should be in a thread.
 * Combines the seed message's Message-ID, References, and In-Reply-To.
 */
export function collectThreadIds(seed: {
	messageId?: string;
	references?: unknown;
	inReplyTo?: string;
}): string[] {
	const ids = new Set<string>();

	if (seed.messageId) ids.add(seed.messageId);
	if (seed.inReplyTo) ids.add(seed.inReplyTo);

	for (const ref of parseReferences(seed.references)) {
		ids.add(ref);
	}

	return [...ids];
}

/**
 * Given a set of expected message IDs and found message IDs,
 * determine which are missing.
 */
export function findMissingIds(expected: string[], found: Set<string>): string[] {
	return expected.filter((id) => !found.has(id));
}

/**
 * Sort messages chronologically by date.
 * Messages without dates are placed at the end.
 */
export function sortChronologically<T extends { date: Date | undefined }>(messages: T[]): T[] {
	return [...messages].sort((a, b) => {
		const da = a.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
		const db = b.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
		return da - db;
	});
}
