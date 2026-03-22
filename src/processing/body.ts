import TurndownService from "turndown";

function createTurndown(): TurndownService {
	return new TurndownService({
		headingStyle: "atx",
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
	});
}

/** Convert HTML email body to markdown. */
export function htmlToMarkdown(html: string): string {
	return createTurndown().turndown(html);
}

/**
 * Select the best body text from parsed MIME parts.
 * Prefers text/plain. Falls back to converting text/html via Turndown.
 */
export function selectBody(text: string | undefined, html: string | undefined): string {
	if (text) return text;
	if (html) return htmlToMarkdown(html);
	return "";
}

// Common signature delimiters. We strip content below these when unambiguous.
const SIGNATURE_DELIMITERS = [
	/^-- $/m, // standard delimiter (dash-dash-space)
	/^---$/m, // common variation
];

const SIGNATURE_OPENERS =
	/^(Sent from|Get Outlook|Cheers,|Kind regards,|Best,|Best regards,|Regards,|Thanks,|Thank you,|Warm regards,)/im;

/**
 * Strip email signatures. Conservative - only removes content below
 * unambiguous delimiters or common sign-off phrases followed by short blocks.
 */
export function stripSignature(body: string): string {
	// Try standard delimiters first
	for (const delimiter of SIGNATURE_DELIMITERS) {
		const match = delimiter.exec(body);
		if (match?.index !== undefined) {
			const before = body.slice(0, match.index).trimEnd();
			const after = body.slice(match.index + match[0].length);
			// Only strip if the signature block is short (< 10 lines)
			const sigLines = after.trim().split("\n");
			if (sigLines.length < 10) return before;
		}
	}

	// Try sign-off phrases
	const lines = body.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line && SIGNATURE_OPENERS.test(line)) {
			// Check remaining lines are short (signature block, not body content)
			const remaining = lines.slice(i);
			if (remaining.length <= 8) {
				return lines.slice(0, i).join("\n").trimEnd();
			}
		}
	}

	return body;
}

const QUOTED_REPLY_PREAMBLE = /^On .+wrote:\s*$/m;
const QUOTED_REPLY_START = /^On \w{3},?\s+\d.+$/; // "On Mon, 1 Jan..." or "On 1 Jan..."
const QUOTED_LINE = /^>/;

/**
 * Strip quoted replies from email body.
 * Removes `>` prefixed lines and "On DATE, NAME wrote:" preambles.
 * Inserts a marker where content was removed.
 */
export function stripQuotedReplies(body: string): string {
	const lines = body.split("\n");
	const result: string[] = [];
	let inQuote = false;
	let stripped = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Check for preamble like "On Mon, 1 Jan 2026, Alice wrote:"
		if (QUOTED_REPLY_PREAMBLE.test(line)) {
			inQuote = true;
			stripped = true;
			continue;
		}

		// Multi-line preamble: "On Mon, 1 Jan 2026, Alice Smith\n<alice@co.nz> wrote:"
		if (QUOTED_REPLY_START.test(line)) {
			const nextLine = lines[i + 1];
			if (nextLine && /wrote:\s*$/.test(nextLine)) {
				inQuote = true;
				stripped = true;
				i++; // skip the continuation line
				continue;
			}
		}

		if (QUOTED_LINE.test(line)) {
			if (!inQuote) {
				inQuote = true;
				stripped = true;
			}
			continue;
		}

		// Exiting a quoted block
		if (inQuote) {
			inQuote = false;
			result.push("[--- quoted reply removed ---]");
			result.push("");
		}

		result.push(line);
	}

	// If we ended inside a quote block
	if (inQuote && stripped) {
		result.push("[--- quoted reply removed ---]");
	}

	return stripped ? result.join("\n") : body;
}

/** Collapse 3+ consecutive blank lines down to 2. Trim leading/trailing whitespace. */
export function normaliseWhitespace(body: string): string {
	return body.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Truncate body text to a character limit.
 * Appends a truncation notice with original length.
 *
 * @param maxChars - 0 means omit body, -1 means no limit, positive = char limit
 */
export function truncateBody(body: string, maxChars: number): string {
	if (maxChars === 0) return "";
	if (maxChars === -1) return body;
	if (body.length <= maxChars) return body;

	const truncated = body.slice(0, maxChars);
	return `${truncated}\n\n[--- truncated at ${fmtNum(maxChars)} chars, full message is ${fmtNum(body.length)} chars ---]`;
}

function fmtNum(n: number): string {
	return n.toLocaleString("en-NZ");
}

/**
 * Run the full body processing pipeline.
 *
 * 1. MIME selection (text/plain preferred, HTML converted to markdown)
 * 2. Signature stripping
 * 3. Quoted reply stripping (optional)
 * 4. Whitespace normalisation
 * 5. Truncation
 */
export function processBody(
	text: string | undefined,
	html: string | undefined,
	options: {
		includeQuoted?: boolean;
		maxBodyChars?: number;
	} = {},
): string {
	const { includeQuoted = false, maxBodyChars = 8_000 } = options;

	let body = selectBody(text, html);
	body = stripSignature(body);
	if (!includeQuoted) body = stripQuotedReplies(body);
	body = normaliseWhitespace(body);
	body = truncateBody(body, maxBodyChars);

	return body;
}
