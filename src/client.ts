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
	private imap: ImapFlow;
	private readonly config: MailConfig;
	private provider: Provider = "generic";
	private knownPaths = new Set<string>();
	private queue: Promise<void> = Promise.resolve();
	private connected = false;
	private reconnecting: Promise<void> | null = null;
	private reconnectAttempts = 0;

	constructor(config: MailConfig) {
		this.config = config;
		this.imap = this.createImapInstance();
	}

	private createImapInstance(): ImapFlow {
		const config = this.config;
		const imap = new ImapFlow({
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

		imap.on("error", (err: Error) => {
			this.connected = false;
			if (!this.reconnecting) {
				config.onConnectionError?.(err);
			}
			if (config.autoReconnect) {
				this.attemptReconnect();
			}
		});

		imap.on("close", () => {
			this.connected = false;
			if (!this.reconnecting) {
				config.onClose?.();
			}
		});

		return imap;
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

		this.connected = true;

		// Detect provider from folder listing
		const tree = await this.imap.list();
		const paths = tree.map((f) => f.path);
		this.knownPaths = new Set(paths);
		this.provider = detectProvider(paths, this.config.host);
	}

	/** Disconnect from the IMAP server. */
	async disconnect(): Promise<void> {
		this.connected = false;
		await this.imap.logout();
	}

	/** Reconnect to the IMAP server with a fresh connection. */
	async reconnect(): Promise<void> {
		try {
			await this.imap.logout();
		} catch {
			// Already dead, ignore
		}
		this.imap = this.createImapInstance();
		await this.connect();
	}

	private attemptReconnect(): void {
		if (this.reconnecting) return;
		this.reconnecting = this.doReconnect().finally(() => {
			this.reconnecting = null;
		});
	}

	private async doReconnect(): Promise<void> {
		const max = this.config.maxReconnectAttempts ?? 3;
		while (this.reconnectAttempts < max) {
			this.reconnectAttempts++;
			const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 10_000);
			await new Promise((r) => setTimeout(r, delay));
			try {
				this.imap = this.createImapInstance();
				await this.connect();
				this.reconnectAttempts = 0;
				return;
			} catch {
				// Retry until exhausted
			}
		}
		this.reconnectAttempts = 0;
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

	/** Serialise operations on the single IMAP connection. */
	private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
		if (this.reconnecting) await this.reconnecting;
		if (!this.connected) {
			throw new MailError("CONNECTION", "Not connected. Call reconnect() or create a new client.");
		}
		let resolve!: () => void;
		const next = new Promise<void>((r) => {
			resolve = r;
		});
		const prev = this.queue;
		this.queue = next;
		await prev;
		if (this.reconnecting) await this.reconnecting;
		if (!this.connected) {
			throw new MailError("CONNECTION", "Not connected. Call reconnect() or create a new client.");
		}
		try {
			return await fn();
		} finally {
			resolve();
		}
	}

	// -- Public API --

	/**
	 * List available IMAP folders with message counts.
	 * Returns a markdown table with folder names, total, and unread counts.
	 * Alias names are used where detected (e.g. "Sent" instead of "[Gmail]/Sent Mail").
	 */
	async folders(): Promise<string> {
		return this.enqueue(() => folders(this.imap, this.provider, this.config));
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
		return this.enqueue(() => list(this.imap, parsed.data, this.config));
	}

	/**
	 * List unread messages. Equivalent to `list({ unread_only: true, limit: 15 })`.
	 * Zero-parameter shortcut for "what's new".
	 */
	async recent(): Promise<string> {
		return this.enqueue(() => recent(this.imap, this.config));
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
		return this.enqueue(() => get(this.imap, parsed.data, this.config));
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
		return this.enqueue(() => thread(this.imap, parsed.data, this.config));
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
		return this.enqueue(() =>
			this.withTimeout(
				search(this.imap, parsed.data, this.config),
				this.config.timeouts.search,
				"search",
			),
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
		return this.enqueue(() => attachment(this.imap, parsed.data));
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
