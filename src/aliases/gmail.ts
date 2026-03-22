/** Gmail folder alias map. Detected via `[Gmail]/` prefix in folder paths. */
export const gmailAliases: Record<string, string> = {
	Sent: "[Gmail]/Sent Mail",
	Drafts: "[Gmail]/Drafts",
	Trash: "[Gmail]/Trash",
	Spam: "[Gmail]/Spam",
	Archive: "[Gmail]/All Mail",
	Starred: "[Gmail]/Starred",
	Important: "[Gmail]/Important",
};
