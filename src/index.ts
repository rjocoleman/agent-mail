/**
 * Pure TypeScript library for read-only IMAP access with markdown output
 * optimised for LLM context windows.
 *
 * @example Quick start
 * ```ts
 * import { createClient } from "@rjocoleman/agent-mail";
 *
 * const mail = await createClient({
 *   host: "imap.gmail.com",
 *   port: 993,
 *   secure: true,
 *   auth: { user: "alice@gmail.com", pass: "app-password" },
 * });
 *
 * const unread = await mail.recent();
 * const msg = await mail.get({ uid: 18823 });
 * await mail.disconnect();
 * ```
 *
 * @module
 */

export { AgentMailClient, createClient } from "./client.js";

export type {
	AttachmentInput,
	AttachmentResult,
	GetInput,
	ListInput,
	MailConfig,
	MailErrorCode,
	SearchInput,
	Summariser,
	ThreadInput,
	Timeouts,
	TlsConfig,
} from "./types.js";

export { MailError } from "./types.js";
