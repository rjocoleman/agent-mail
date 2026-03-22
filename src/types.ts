/** Detected email provider, used for folder alias resolution. */
export type Provider = "gmail" | "fastmail" | "outlook" | "generic";

/**
 * Callback for generating message summaries.
 * Receives the fully processed body text (after signature/quote stripping).
 * Should return 1-3 sentences. The library does not ship a model.
 *
 * @example Using Claude
 * ```ts
 * const summarise: Summariser = async (body) => {
 *   const resp = await claude.messages.create({ messages: [{ role: "user", content: body }] });
 *   return resp.content[0].text;
 * };
 * ```
 */
export type Summariser = (body: string) => Promise<string>;

/** Connection and operation timeouts in milliseconds. */
export interface Timeouts {
	/** Connection timeout. Default: 10,000ms. */
	connect?: number;
	/** Command timeout. Default: 30,000ms. */
	command?: number;
	/** Search timeout. Default: 60,000ms. */
	search?: number;
}

/** TLS connection overrides. */
export interface TlsConfig {
	/** SNI hostname override. Defaults to `host`. */
	servername?: string;
	/** Set to `false` to disable certificate validation (not recommended). */
	rejectUnauthorized?: boolean;
}

/**
 * IMAP client configuration.
 *
 * @example Minimal config
 * ```ts
 * const config: MailConfig = {
 *   host: "imap.gmail.com",
 *   port: 993,
 *   secure: true,
 *   auth: { user: "alice@gmail.com", pass: "app-password" },
 *   timezone: "Pacific/Auckland",
 *   ip_family: 4,
 * };
 * ```
 */
export interface MailConfig {
	/** IMAP server hostname. */
	host: string;
	/** IMAP server port (typically 993). */
	port: number;
	/** Use TLS (typically true). */
	secure: boolean;
	/** Authentication credentials. */
	auth: { user: string; pass: string };
	/** Timezone for date formatting. Default: "UTC". */
	timezone: string;
	/** Operation timeouts. */
	timeouts: { connect: number; command: number; search: number };
	/** IP version preference. 4 = IPv4 only, 6 = IPv6 only, 0 = both. Default: 0. */
	ip_family: 0 | 4 | 6;
	/** TLS connection overrides. */
	tls: TlsConfig;
	/** Default summariser callback. Can be overridden per-call. */
	summarise?: Summariser;
	/** Custom folder name mappings. */
	folderAliases?: Record<string, string>;
}

/** Input for `list()` before defaults are applied. */
export interface ListInput {
	/** Folder name or alias. Default: "INBOX". */
	folder?: string;
	/** Max messages (1-50). Default: 20. */
	limit?: number;
	/** Pagination offset. Default: 0. */
	offset?: number;
	/** Only unread messages. Default: false. */
	unread_only?: boolean;
	/** ISO date, IMAP SINCE. */
	since?: string;
	/** ISO date, IMAP BEFORE. */
	before?: string;
	/** Sender filter substring. */
	from?: string;
}

/** Input for `get()`. Requires `uid`. */
export interface GetInput {
	/** Message UID (required). */
	uid: number;
	/** Folder name or alias. Default: "INBOX". */
	folder?: string;
	/** Return raw RFC 2822 source. Default: false. */
	raw?: boolean;
	/** Body char limit. 0 = omit, -1 = no limit. Default: 8,000. */
	max_body_chars?: number;
	/** Keep quoted replies. Default: false. */
	include_quoted?: boolean;
	/** Show Message-ID header. Default: false. */
	include_headers?: boolean;
	/** Prepend summary block. Default: false. */
	summary_first?: boolean;
	/** Per-call summariser override. */
	summarise?: Summariser;
}

/** Input for `thread()`. Requires `uid`. */
export interface ThreadInput {
	/** UID of any message in the thread (required). */
	uid: number;
	/** Folder name or alias. Default: "INBOX". */
	folder?: string;
	/** Body char limit per message. Default: 4,000. */
	max_body_chars?: number;
	/** Keep quoted replies. Default: false. */
	include_quoted?: boolean;
	/** Prepend per-message summaries. Default: false. */
	summary_first?: boolean;
	/** Per-call summariser override. */
	summarise?: Summariser;
}

/** Input for `search()`. All fields optional. */
export interface SearchInput {
	/** Folder name, or "*" for all folders. Default: "INBOX". */
	folder?: string;
	/** Free text search (IMAP TEXT). */
	query?: string;
	/** Filter by sender. */
	from?: string;
	/** Filter by recipient. */
	to?: string;
	/** Filter by subject. */
	subject?: string;
	/** ISO date, IMAP SINCE. */
	since?: string;
	/** ISO date, IMAP BEFORE. */
	before?: string;
	/** Filter by attachment presence. */
	has_attachment?: boolean;
	/** Only unread messages. Default: false. */
	unread_only?: boolean;
	/** Only flagged messages. Default: false. */
	flagged_only?: boolean;
	/** Max results (1-50). Default: 10. */
	limit?: number;
}

/** Input for `attachment()`. Requires `uid` and `part`. */
export interface AttachmentInput {
	/** Message UID (required). */
	uid: number;
	/** MIME part index from get() output (required). */
	part: string;
	/** Folder name or alias. Default: "INBOX". */
	folder?: string;
}

/**
 * Result from downloading an attachment.
 * The only API function that returns a typed object instead of markdown.
 */
export interface AttachmentResult {
	/** Original filename, e.g. "report.pdf". */
	filename: string;
	/** MIME type, e.g. "application/pdf". */
	mime_type: string;
	/** File size in bytes. */
	size: number;
	/** Raw file content. */
	content: Buffer;
}

/**
 * Error codes returned by {@linkcode MailError}.
 *
 * - `CONNECTION` - can't reach host
 * - `AUTH` - bad credentials
 * - `TIMEOUT` - exceeded configured timeout
 * - `NOT_FOUND` - UID or folder doesn't exist
 * - `TOO_LARGE` - attachment exceeds 25 MB limit
 * - `INVALID_INPUT` - Zod validation failed
 */
export type MailErrorCode =
	| "CONNECTION"
	| "AUTH"
	| "TIMEOUT"
	| "NOT_FOUND"
	| "TOO_LARGE"
	| "INVALID_INPUT";

/**
 * Error thrown by all agent-mail operations.
 * Check the `code` property to determine the error type.
 *
 * @example Handling errors
 * ```ts
 * import { MailError } from "@rjocoleman/agent-mail";
 *
 * try {
 *   await mail.get({ uid: 99999 });
 * } catch (err) {
 *   if (err instanceof MailError && err.code === "NOT_FOUND") {
 *     console.log("Message not found");
 *   }
 * }
 * ```
 */
export class MailError extends Error {
	/** The error category. */
	code: MailErrorCode;

	constructor(code: MailErrorCode, message: string, cause?: unknown) {
		super(message, { cause });
		this.name = "MailError";
		this.code = code;
	}
}

/** Maximum attachment download size in bytes (25 MB). */
export const MAX_ATTACHMENT_BYTES: number = 25 * 1024 * 1024;

/** Maximum messages to include in a thread. */
export const MAX_THREAD_MESSAGES: number = 50;

/** Default body truncation limit for `get()`. */
export const DEFAULT_BODY_CHARS: number = 8_000;

/** Default body truncation limit per message in `thread()`. */
export const DEFAULT_THREAD_BODY_CHARS: number = 4_000;
