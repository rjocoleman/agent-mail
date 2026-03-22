const USAGE = `agent-mail - Read-only IMAP access with markdown output

Usage: agent-mail <command> [options]

Commands:
  folders                List available IMAP folders
  list                   List recent messages in a folder
  recent                 List unread messages (shortcut)
  get                    Fetch a single message by UID
  thread                 Fetch a full conversation thread
  search                 Search messages
  attachment             Download an attachment

Global options:
  --config <path>        Path to config.toml
  --help                 Show this help
  --version              Show version`;

const COMMAND_HELP: Record<string, string> = {
	folders: `agent-mail folders

  List all IMAP folders with message counts.
  No additional options.`,

	list: `agent-mail list [options]

  List recent messages in a folder.

  Options:
    --folder <name>      Folder name or alias (default: INBOX)
    --limit <n>          Max messages, 1-50 (default: 20)
    --offset <n>         Pagination offset (default: 0)
    --unread             Only unread messages
    --since <date>       Messages since ISO date
    --before <date>      Messages before ISO date
    --from <addr>        Filter by sender`,

	recent: `agent-mail recent

  List unread messages. Equivalent to: list --unread --limit 15
  No additional options.`,

	get: `agent-mail get --uid <uid> [options]

  Fetch a single message by UID.

  Options:
    --uid <n>            Message UID (required)
    --folder <name>      Folder name or alias (default: INBOX)
    --raw                Return raw RFC 2822 source
    --max-chars <n>      Body char limit (default: 8000, 0=omit, -1=no limit)
    --quoted             Include quoted replies
    --headers            Include Message-ID header
    --summary            Prepend a summary block`,

	thread: `agent-mail thread --uid <uid> [options]

  Fetch a full conversation thread.

  Options:
    --uid <n>            UID of any message in the thread (required)
    --folder <name>      Folder name or alias (default: INBOX)
    --max-chars <n>      Body char limit per message (default: 4000)
    --quoted             Include quoted replies
    --summary            Prepend per-message summaries`,

	search: `agent-mail search [options]

  Full-text and structured search.

  Options:
    --query <text>       Free text search
    --folder <name>      Folder or "*" for all (default: INBOX)
    --from <addr>        Filter by sender
    --to <addr>          Filter by recipient
    --subject <text>     Filter by subject
    --since <date>       Messages since ISO date
    --before <date>      Messages before ISO date
    --attachment          Only messages with attachments
    --unread             Only unread messages
    --flagged            Only flagged messages
    --limit <n>          Max results, 1-50 (default: 10)`,

	attachment: `agent-mail attachment --uid <uid> --part <id> [options]

  Download a specific attachment.

  Options:
    --uid <n>            Message UID (required)
    --part <id>          MIME part index from get output (required)
    --folder <name>      Folder name or alias (default: INBOX)
    -o, --output <path>  Write to file (default: stdout)`,
};

export function printUsage(): void {
	console.log(USAGE);
}

export function printCommandHelp(command: string): void {
	const help = COMMAND_HELP[command];
	if (help) {
		console.log(help);
	} else {
		console.error(`Unknown command: ${command}`);
		printUsage();
	}
}
