import { describe, expect, mock, test } from "bun:test";
import { mailConfigSchema } from "./schemas.js";
import {
	asyncIter,
	HTML_EMAIL_SOURCE,
	HTML_ENVELOPE,
	MULTIPART_BODY_STRUCTURE,
	makeFetchMessage,
	PLAIN_BODY_STRUCTURE,
	REPLY_EMAIL_SOURCE,
	REPLY_ENVELOPE,
	SIMPLE_EMAIL_SOURCE,
	SIMPLE_ENVELOPE,
} from "./test-fixtures.js";
import { MailError } from "./types.js";

// Build realistic fetch messages
const msg1 = makeFetchMessage({
	uid: 18823,
	envelope: SIMPLE_ENVELOPE,
	source: SIMPLE_EMAIL_SOURCE,
	flags: new Set(),
	bodyStructure: PLAIN_BODY_STRUCTURE,
});

const msg2 = makeFetchMessage({
	uid: 18820,
	envelope: {
		date: new Date("2026-03-22T08:30:00Z"),
		subject: "[acme-gate] PR #47 merged",
		from: [{ name: "GitHub", address: "noreply@github.com" }],
		to: [{ name: "Rob", address: "rob@example.com" }],
		messageId: "<gh47@github.com>",
	},
	source: Buffer.from(
		[
			"From: GitHub <noreply@github.com>",
			"To: Rob <rob@example.com>",
			"Subject: [acme-gate] PR #47 merged",
			"Date: Sun, 22 Mar 2026 08:30:00 +0000",
			"Message-ID: <gh47@github.com>",
			"Content-Type: text/plain",
			"",
			"PR #47 has been merged into main.",
		].join("\r\n"),
	),
	flags: new Set(["\\Seen"]),
});

const msg3 = makeFetchMessage({
	uid: 18819,
	envelope: HTML_ENVELOPE,
	source: HTML_EMAIL_SOURCE,
	flags: new Set(["\\Seen"]),
	bodyStructure: MULTIPART_BODY_STRUCTURE,
});

const replyMsg = makeFetchMessage({
	uid: 18800,
	envelope: REPLY_ENVELOPE,
	source: REPLY_EMAIL_SOURCE,
	flags: new Set(["\\Seen"]),
});

// Track mock instance per test
let latestImap: ReturnType<typeof createMockImap>;

function createMockImap() {
	return {
		on: mock(() => {}),
		connect: mock(() => Promise.resolve()),
		logout: mock(() => Promise.resolve()),
		list: mock(() =>
			Promise.resolve([
				{ path: "INBOX" },
				{ path: "[Gmail]/Sent Mail" },
				{ path: "[Gmail]/Drafts" },
				{ path: "[Gmail]/Trash" },
				{ path: "[Gmail]/All Mail" },
			]),
		),
		status: mock(() => Promise.resolve({ messages: 3, unseen: 1 })),
		getMailboxLock: mock(() => Promise.resolve({ release: mock() })),
		search: mock(() => Promise.resolve([18823, 18820, 18819])),
		fetch: mock(() => asyncIter([msg1, msg2, msg3])),
		fetchOne: mock((uid: string) => {
			const uidNum = Number(uid);
			if (uidNum === 18823) return Promise.resolve(msg1);
			if (uidNum === 18820) return Promise.resolve(msg2);
			if (uidNum === 18819) return Promise.resolve(msg3);
			if (uidNum === 18800) return Promise.resolve(replyMsg);
			return Promise.resolve(false);
		}),
		download: mock(() =>
			Promise.resolve({
				meta: {
					expectedSize: 100,
					contentType: "application/pdf",
					filename: "invoice-march.pdf",
				},
				content: asyncIter([Buffer.from("fake-pdf-content")])[Symbol.asyncIterator](),
			}),
		),
	};
}

mock.module("imapflow", () => ({
	ImapFlow: mock((..._args: unknown[]) => {
		latestImap = createMockImap();
		return latestImap;
	}),
}));

const { AgentMailClient, createClient } = await import("./client.js");

const validConfig = {
	host: "imap.gmail.com",
	port: 993,
	secure: true,
	auth: { user: "test@gmail.com", pass: "secret" },
};

describe("AgentMailClient", () => {
	test("connects and detects Gmail provider", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();
		expect(latestImap.connect).toHaveBeenCalled();
		expect(latestImap.list).toHaveBeenCalled();
	});

	test("disconnect calls logout", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();
		await client.disconnect();
		expect(latestImap.logout).toHaveBeenCalled();
	});
});

describe("folders()", () => {
	test("returns markdown with folder table", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.folders();
		expect(result).toStartWith("# Mail Folders");
		expect(result).toContain("INBOX");
		expect(result).toContain("Folder");
		expect(result).toContain("Total");
		expect(result).toContain("Unread");
	});

	test("shows alias names with parenthetical for Gmail", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.folders();
		// Gmail aliases should show: Sent ([Gmail]/Sent Mail)
		expect(result).toContain("Sent ([Gmail]/Sent Mail)");
	});
});

describe("list()", () => {
	test("returns markdown table with messages", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.list();
		expect(result).toContain("# INBOX");
		expect(result).toContain("unread");
		expect(result).toContain("total");
		expect(result).toContain("18823");
		expect(result).toContain("Re: Deployment window Friday");
		expect(result).toContain("Alice");
		expect(result).toContain("● = unread");
	});

	test("accepts folder and limit options", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.list({ folder: "INBOX", limit: 2 });
		expect(result).toContain("# INBOX");
	});

	test("rejects limit > 50", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		try {
			await client.list({ limit: 100 });
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(MailError);
			expect((err as MailError).code).toBe("INVALID_INPUT");
		}
	});
});

describe("recent()", () => {
	test("returns markdown for unread messages", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.recent();
		expect(result).toContain("# INBOX");
		expect(result).toContain("unread");
	});
});

describe("get()", () => {
	test("returns markdown with message content", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823 });
		expect(result).toContain("# Re: Deployment window Friday");
		expect(result).toContain("Alice <alice@co.nz>");
		expect(result).toContain("Rob <rob@example.com>");
		expect(result).toContain("canary config");
		expect(result).toContain("UID");
		expect(result).toContain("18823");
	});

	test("strips signature by default", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823 });
		// The "-- \nAlice\nalice@co.nz" signature should be stripped
		expect(result).not.toContain("alice@co.nz\n");
	});

	test("supports summary_first", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823, summary_first: true });
		expect(result).toContain("**Summary:**");
	});

	test("supports max_body_chars: 0 (metadata only)", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823, max_body_chars: 0 });
		expect(result).toContain("# Re: Deployment window Friday");
		expect(result).toContain("Alice");
		expect(result).not.toContain("canary config");
	});

	test("supports include_headers", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823, include_headers: true });
		expect(result).toContain("Message-ID");
		expect(result).toContain("<msg001@co.nz>");
	});

	test("returns raw source when raw: true", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18823, raw: true });
		expect(result).toContain("From: Alice <alice@co.nz>");
		expect(result).toContain("MIME-Version: 1.0");
	});

	test("shows attachments for multipart messages", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.get({ uid: 18819 });
		expect(result).toContain("# Invoice March 2026");
		expect(result).toContain("invoice-march.pdf");
		expect(result).toContain("application/pdf");
	});

	test("throws NOT_FOUND for missing UID", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		try {
			await client.get({ uid: 99999 });
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(MailError);
			expect((err as MailError).code).toBe("NOT_FOUND");
		}
	});
});

describe("thread()", () => {
	test("returns markdown thread with multiple messages", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.thread({ uid: 18823 });
		expect(result).toContain("# Thread:");
		expect(result).toContain("Deployment window Friday");
		expect(result).toContain("Participants:");
	});

	test("throws NOT_FOUND for missing UID", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		try {
			await client.thread({ uid: 99999 });
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(MailError);
			expect((err as MailError).code).toBe("NOT_FOUND");
		}
	});
});

describe("search()", () => {
	test("returns markdown search results", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.search({ query: "deployment" });
		expect(result).toContain("# Search: INBOX");
		expect(result).toContain("**Query:**");
		expect(result).toContain("`deployment`");
		expect(result).toContain("18823");
	});

	test("supports from filter", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.search({ from: "alice@co.nz" });
		expect(result).toContain("from:alice@co.nz");
	});
});

describe("attachment()", () => {
	test("downloads attachment and returns result", async () => {
		const config = mailConfigSchema.parse(validConfig);
		const client = new AgentMailClient(config);
		await client.connect();

		const result = await client.attachment({ uid: 18819, part: "2" });
		expect(result.filename).toBe("invoice-march.pdf");
		expect(result.mime_type).toBe("application/pdf");
		expect(result.size).toBeGreaterThan(0);
		expect(result.content).toBeInstanceOf(Buffer);
	});
});

describe("createClient", () => {
	test("validates config and creates client", async () => {
		const client = await createClient(validConfig);
		expect(client).toBeInstanceOf(AgentMailClient);
	});

	test("throws INVALID_INPUT for bad config", async () => {
		try {
			await createClient({ host: "" });
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(MailError);
			expect((err as MailError).code).toBe("INVALID_INPUT");
		}
	});

	test("throws INVALID_INPUT for empty config", async () => {
		try {
			await createClient({});
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(MailError);
			expect((err as MailError).code).toBe("INVALID_INPUT");
		}
	});
});
