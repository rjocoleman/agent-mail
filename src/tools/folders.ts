import type { ImapFlow } from "imapflow";
import { reverseAliases } from "../aliases/index.js";
import { formatNumber, renderTable } from "../processing/format.js";
import { type MailConfig, type Provider, wrapImapError } from "../types.js";

/**
 * List available IMAP folders with message counts.
 * Output uses alias names where detected, with the real IMAP path
 * in parenthetical when it differs from the display name.
 */
export async function folders(
	client: ImapFlow,
	provider: Provider,
	config: MailConfig,
): Promise<string> {
	try {
		const tree = await client.list();
		const reverse = reverseAliases(provider, config.folderAliases);

		const rows: string[][] = [];

		for (const folder of tree) {
			const status = await client.status(folder.path, {
				messages: true,
				unseen: true,
			});

			const alias = reverse.get(folder.path);
			const displayName =
				alias && alias !== folder.path ? `${alias} (${folder.path})` : folder.path;

			rows.push([
				displayName,
				formatNumber(status.messages ?? 0),
				formatNumber(status.unseen ?? 0),
			]);
		}

		const table = renderTable(["Folder", "Total", "Unread"], rows, new Set([1, 2]));

		return `# Mail Folders\n\n${table}`;
	} catch (err) {
		throw wrapImapError(err, "folders");
	}
}
