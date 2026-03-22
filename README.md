# agent-mail

[![JSR](https://jsr.io/badges/@rjocoleman/agent-mail)](https://jsr.io/@rjocoleman/agent-mail)

Pure TypeScript library for read-only IMAP access. Markdown output optimised for LLM context windows.

- **Library, not a server.** Export functions. The consumer decides how to expose them.
- **Read-only.** No send, no delete, no move, no flag mutations. Safe to hand to any agent.
- **Markdown-native.** Every response is structured markdown ready for direct injection into agent context.
- **Token-efficient.** Strips signatures, quoted replies, and redundant headers by default.
- **Stateless calls.** Each function is self-contained. Pagination via explicit offset/limit.

## Install

```bash
bunx jsr add @rjocoleman/agent-mail
```

## Quick Start

```typescript
import { createClient } from "@rjocoleman/agent-mail";

const mail = await createClient({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: "alice@example.com", pass: "app-password" },
});

// Scan unread
const unread = await mail.recent();

// Read a message
const msg = await mail.get({ uid: 18823, summary_first: true });

// Full conversation
const thread = await mail.thread({ uid: 18823 });

// Search
const results = await mail.search({ query: "deployment rollback" });

// Download attachment
const file = await mail.attachment({ uid: 18823, part: "2" });

await mail.disconnect();
```

## API

All functions return markdown strings except `attachment()`, which returns a typed `AttachmentResult` object.

### `mail.folders()`

List available IMAP folders with message counts.

### `mail.list(input?)`

List recent messages in a folder.

```typescript
await mail.list({ folder: "Sent", limit: 10, unread_only: true });
```

| Option | Default | Description |
|--------|---------|-------------|
| `folder` | `"INBOX"` | Folder name or alias |
| `limit` | `20` | Max messages (1-50) |
| `offset` | `0` | Pagination offset |
| `unread_only` | `false` | Only unread messages |
| `since` | - | ISO date, IMAP SINCE |
| `before` | - | ISO date, IMAP BEFORE |
| `from` | - | Sender filter |

### `mail.recent()`

Convenience alias for `list({ unread_only: true, limit: 15 })`.

### `mail.get(input)`

Fetch a single message by UID.

```typescript
await mail.get({ uid: 18823, summary_first: true, max_body_chars: 4000 });
```

| Option | Default | Description |
|--------|---------|-------------|
| `uid` | required | IMAP UID |
| `folder` | `"INBOX"` | Folder name or alias |
| `raw` | `false` | Return raw RFC 2822 |
| `max_body_chars` | `8000` | `0` = omit body, `-1` = no limit |
| `include_quoted` | `false` | Keep quoted replies |
| `include_headers` | `false` | Show Message-ID |
| `summary_first` | `false` | Prepend summary block |
| `summarise` | - | Per-call summariser override |

### `mail.thread(input)`

Fetch a full conversation thread as a single markdown document.

```typescript
await mail.thread({ uid: 18823 });
```

### `mail.search(input?)`

Full-text and structured search. Use `folder: "*"` to search all folders.

```typescript
await mail.search({ query: "quarterly report", from: "alice@co.nz", since: "2026-01-01" });
```

### `mail.attachment(input)`

Download a specific attachment by UID and part index. Returns `AttachmentResult` with raw bytes.

```typescript
const file = await mail.attachment({ uid: 18823, part: "2" });
await Bun.write("report.pdf", file.content);
```

## Configuration

```typescript
interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  timezone?: string;           // default: "UTC"
  timeouts?: {
    connect?: number;          // default: 10_000ms
    command?: number;          // default: 30_000ms
    search?: number;           // default: 60_000ms
  };
  ip_family?: 0 | 4 | 6;       // default: 0 (both). 4 = IPv4 only
  tls?: {
    servername?: string;       // SNI hostname override
    rejectUnauthorized?: boolean;
  };
  summarise?: Summariser;      // default summariser callback
  folderAliases?: Record<string, string>;
}
```

### Folder Aliases

The library auto-detects Gmail, Fastmail, and Outlook and maps common folder names. Agents can always say `folder: "Sent"` regardless of the provider.

Custom aliases override the built-in maps:

```typescript
const mail = await createClient({
  ...config,
  folderAliases: { Receipts: "INBOX.Receipts" },
});
```

### Summariser

Pass a callback to generate message summaries. The library does not ship a model.

```typescript
const mail = await createClient({
  ...config,
  summarise: async (body) => {
    const resp = await claude.messages.create({ /* ... */ });
    return resp.content[0].text;
  },
});

// Per-call override
await mail.get({
  uid: 18823,
  summary_first: true,
  summarise: async (body) => ollama(body),
});
```

Without a summariser, the fallback extracts the first paragraph (up to 300 chars).

## Error Handling

All errors are `MailError` instances with a `code` property:

| Code | Meaning |
|------|---------|
| `CONNECTION` | Can't reach host |
| `AUTH` | Bad credentials |
| `TIMEOUT` | Exceeded configured timeout |
| `NOT_FOUND` | UID or folder doesn't exist |
| `TOO_LARGE` | Attachment exceeds 25 MB limit |
| `INVALID_INPUT` | Validation failed |

```typescript
import { MailError } from "@rjocoleman/agent-mail";

try {
  await mail.get({ uid: 99999 });
} catch (err) {
  if (err instanceof MailError && err.code === "NOT_FOUND") {
    // handle missing message
  }
}
```

## CLI

agent-mail includes a CLI for direct use from the command line. Requires Bun.

### Config

Create `~/.config/agent-mail/config.toml`:

```toml
host = "imap.gmail.com"
port = 993
secure = true
timezone = "Pacific/Auckland"
# ip_family = 4  # uncomment to force IPv4 (helps with flaky IPv6)

[auth]
user = "alice@gmail.com"
pass = "app-password"
```

Config resolution: `--config` flag > `AGENT_MAIL_CONFIG` env var > `~/.config/agent-mail/config.toml`.

### Commands

```bash
agent-mail folders
agent-mail list --folder Sent --limit 10
agent-mail recent
agent-mail get --uid 18823 --summary
agent-mail thread --uid 18823
agent-mail search --query "deploy" --from alice
agent-mail attachment --uid 18823 --part 2 -o file.pdf
```

Run `agent-mail --help` or `agent-mail <command> --help` for full options.

## Development

```bash
bun install
bun run check     # lint + typecheck + test
bun test          # tests only
bun run lint:fix  # auto-fix lint/format
bun run typecheck # TypeScript only
bun run cli       # run CLI locally
```

### Releasing

```bash
npm version patch   # bumps package.json + jsr.json, commits, tags (also: minor, major)
git push origin main --tags
```

Pushing a `v*` tag triggers CI checks and publishes to [JSR](https://jsr.io).

### CI

GitHub Actions runs lint, typecheck, and tests on every push to `main` and all PRs. The publish workflow runs the same checks before publishing to JSR.

## Stack

| Concern | Package |
|---------|---------|
| Runtime | [Bun](https://bun.sh) |
| IMAP | [imapflow](https://github.com/postalsys/imapflow) |
| MIME parsing | [mailparser](https://github.com/nodemailer/mailparser) |
| HTML to markdown | [turndown](https://github.com/mixmark-io/turndown) |
| Validation | [zod](https://github.com/colinhacks/zod) |
| Linting/formatting | [Biome](https://biomejs.dev) |
| Registry | [JSR](https://jsr.io) |
