import type { Summariser } from "../types.js";

/**
 * Deterministic fallback summariser.
 * Extracts the first non-empty paragraph, truncated to 300 chars.
 */
export function fallbackSummarise(body: string): string {
	const paragraphs = body.split(/\n\n+/);
	const first = paragraphs.find((p) => p.trim().length > 0);
	if (!first) return "";

	const trimmed = first.trim();
	if (trimmed.length <= 300) return trimmed;
	return `${trimmed.slice(0, 297)}...`;
}

/**
 * Resolve and run the summariser for a message body.
 *
 * Resolution order:
 * 1. Per-call override (`callSummariser`)
 * 2. Client-level default (`configSummariser`)
 * 3. Deterministic fallback (first paragraph, 300 chars)
 */
export async function summarise(
	body: string,
	callSummariser?: Summariser,
	configSummariser?: Summariser,
): Promise<string> {
	const fn = callSummariser ?? configSummariser;
	if (fn) return fn(body);
	return fallbackSummarise(body);
}
