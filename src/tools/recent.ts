import type { ImapFlow } from "imapflow";
import type { MailConfig } from "../types.js";
import { list } from "./list.js";

/**
 * Convenience alias for unread messages.
 * Equivalent to `list({ unread_only: true, limit: 15 })`.
 */
export async function recent(client: ImapFlow, config: MailConfig): Promise<string> {
	return list(
		client,
		{
			folder: "INBOX",
			limit: 15,
			offset: 0,
			unread_only: true,
		},
		config,
	);
}
