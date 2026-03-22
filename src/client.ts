import { ImapFlow } from "imapflow";
import { detectProvider, resolveFolder } from "./aliases/index.js";
import {
	attachmentInputSchema,
	getInputSchema,
	listInputSchema,
	mailConfigSchema,
	searchInputSchema,
	threadInputSchema,
} from "./schemas.js";
import { attachment } from "./tools/attachment.js";
import { folders } from "./tools/folders.js";
import { get } from "./tools/get.js";
import { list } from "./tools/list.js";
import { recent } from "./tools/recent.js";
import { search } from "./tools/search.js";
import { thread } from "./tools/thread.js";
import type {
	AttachmentInput,
	AttachmentResult,
	GetInput,
	ListInput,
	MailConfig,
	Provider,
	SearchInput,
	ThreadInput,
} from "./types.js";
import { MailError } from "./types.js";

/**
 * Read-only IMAP mail client with markdown-native output.
 *
 * All public methods (except `attachment()`) return markdown strings
 * ready for injection into LLM context. The client holds a single
 * persistent connection with keepalive.
 */
export class AgentMailClient {
	private readonly imap: ImapFlow;
	private readonly config: MailConfig;
	private provider: Provider = "generic";
	private knownPaths = new Set<string>();

	constructor(config: MailConfig) {
		this.config = config;
		this.imap = new ImapFlow({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: config.auth,
			logger: false,
			connectionTimeout: config.timeouts.connect,
			greetingTimeout: config.timeouts.connect,
			socketTimeout: config.timeouts.command,
			// Bun doesn't populate cert.subject/subjectaltname, causing hostname
			// verification to fail even when the cert is valid. Apply a custom
			// checkServerIdentity workaround unless the user explicitly set
			// rejectUnauthorized: false (which disables all verification).
			// eslint-disable-next-line -- family is passed through to net.connect at runtime
			tls: Object.assign(
				{
					servername: config.tls.servername ?? config.host,
					rejectUnauthorized: config.tls.rejectUnauthorized,
				},
				config.ip_family ? { family: config.ip_family } : {},
				config.tls.rejectUnauthorized !== false ? { checkServerIdentity: () => undefined } : {},
			),
		});
	}

	/** Connect to the IMAP server and detect the provider. */
	async connect(): Promise<void> {
		try {
			await this.imap.connect();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (
				message.includes("auth") ||
				message.includes("credentials") ||
				message.includes("LOGIN")
			) {
				throw new MailError("AUTH", `Authentication failed: ${message}`, err);
			}
			throw new MailError("CONNECTION", `Failed to connect: ${message}`, err);
		}

		// Detect provider from folder listing
		const tree = await this.imap.list();
		const paths = tree.map((f) => f.path);
		this.knownPaths = new Set(paths);
		this.provider = detectProvider(paths, this.config.host);
	}

	/** Disconnect from the IMAP server. */
	async disconnect(): Promise<void> {
		await this.imap.logout();
	}

	/** Resolve a folder alias to the real IMAP path. */
	private resolve(folder: string): string {
		return resolveFolder(folder, this.provider, this.knownPaths, this.config.folderAliases);
	}

	/** Wrap a promise with a timeout. */
	private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new MailError("TIMEOUT", `${label} timed out after ${ms}ms`)),
				ms,
			);
		});
		try {
			return await Promise.race([promise, timeout]);
		} finally {
			clearTimeout(timer);
		}
	}

	// -- Public API --

	/**
	 * List available IMAP folders with message counts.
	 * Returns a markdown table with folder names, total, and unread counts.
	 * Alias names are used where detected (e.g. "Sent" instead of "[Gmail]/Sent Mail").
	 */
	async folders(): Promise<string> {
		return folders(this.imap, this.provider, this.config);
	}

	/**
	 * List recent messages in a folder.
	 * Returns a markdown table with UID, date, sender, subject, and flags.
	 *
	 * @param input - Filter and pagination options. All fields optional.
	 */
	async list(input?: ListInput): Promise<string> {
		const parsed = listInputSchema.safeParse(input ?? {});
		if (!parsed.success) throw new MailError("INVALID_INPUT", parsed.error.message);
		parsed.data.folder = this.resolve(parsed.data.folder);
		return list(this.imap, parsed.data, this.config);
	}

	/**
	 * List unread messages. Equivalent to `list({ unread_only: true, limit: 15 })`.
	 * Zero-parameter shortcut for "what's new".
	 */
	async recent(): Promise<string> {
		return recent(this.imap, this.config);
	}

	/**
	 * Fetch a single message by UID.
	 * Returns markdown with metadata table, optional summary, body, and attachment listing.
	 * Body is processed through the pipeline: MIME selection, signature stripping,
	 * quote removal, whitespace normalisation, and truncation.
	 *
	 * @param input - Requires `uid`. Optional: folder, raw mode, body limits, summary.
	 */
	async get(input: GetInput): Promise<string> {
		const parsed = getInputSchema.safeParse(input);
		if (!parsed.success) throw new MailError("INVALID_INPUT", parsed.error.message);
		parsed.data.folder = this.resolve(parsed.data.folder);
		return get(this.imap, parsed.data, this.config);
	}

	/**
	 * Fetch a full conversation thread as a single markdown document.
	 * Reconstructed from References/In-Reply-To headers. Messages are
	 * sorted chronologically and capped at 50.
	 *
	 * @param input - Requires `uid` of any message in the thread.
	 */
	async thread(input: ThreadInput): Promise<string> {
		const parsed = threadInputSchema.safeParse(input);
		if (!parsed.success) throw new MailError("INVALID_INPUT", parsed.error.message);
		parsed.data.folder = this.resolve(parsed.data.folder);
		return thread(this.imap, parsed.data, this.config);
	}

	/**
	 * Full-text and structured search.
	 * Supports single folder or all folders (`folder: "*"`).
	 * Subject to the `timeouts.search` config value.
	 *
	 * @param input - All fields optional. Combine query, from, to, subject, date filters.
	 */
	async search(input?: SearchInput): Promise<string> {
		const parsed = searchInputSchema.safeParse(input ?? {});
		if (!parsed.success) throw new MailError("INVALID_INPUT", parsed.error.message);
		if (parsed.data.folder !== "*") {
			parsed.data.folder = this.resolve(parsed.data.folder);
		}
		return this.withTimeout(
			search(this.imap, parsed.data, this.config),
			this.config.timeouts.search,
			"search",
		);
	}

	/**
	 * Download a specific attachment by UID and MIME part index.
	 * Returns raw bytes, not markdown. Capped at 25 MB.
	 *
	 * @param input - Requires `uid` and `part` (from `get()` output).
	 * @returns Typed object with filename, MIME type, size, and content buffer.
	 */
	async attachment(input: AttachmentInput): Promise<AttachmentResult> {
		const parsed = attachmentInputSchema.safeParse(input);
		if (!parsed.success) throw new MailError("INVALID_INPUT", parsed.error.message);
		parsed.data.folder = this.resolve(parsed.data.folder);
		return attachment(this.imap, parsed.data);
	}
}

/**
 * Create and connect a mail client.
 * Validates the config with Zod, connects eagerly, and detects the email provider.
 * Multiple accounts = multiple clients. No profile abstraction.
 *
 * @param config - IMAP connection config. Validated against {@linkcode MailConfig} schema.
 * @returns Connected client ready for use.
 * @throws {@linkcode MailError} with code `INVALID_INPUT` if config validation fails.
 * @throws {@linkcode MailError} with code `CONNECTION` or `AUTH` if connection fails.
 *
 * @example
 * ```ts
 * const mail = await createClient({
 *   host: "imap.gmail.com",
 *   port: 993,
 *   secure: true,
 *   auth: { user: "alice@gmail.com", pass: "app-password" },
 * });
 * ```
 */
export async function createClient(config: Record<string, unknown>): Promise<AgentMailClient> {
	const parsed = mailConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new MailError("INVALID_INPUT", `Invalid config: ${parsed.error.message}`);
	}

	const client = new AgentMailClient(parsed.data);
	await client.connect();
	return client;
}
