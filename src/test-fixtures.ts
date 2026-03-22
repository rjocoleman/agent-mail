/**
 * Shared test fixtures for mocking ImapFlow responses.
 * These provide realistic message data so tool functions
 * get exercised through integration tests.
 */

/** A simple text/plain email source for simpleParser. */
export const SIMPLE_EMAIL_SOURCE = Buffer.from(
	[
		"From: Alice <alice@co.nz>",
		"To: Rob <rob@example.com>",
		"CC: Platform Team <platform@example.com>",
		"Subject: Re: Deployment window Friday",
		"Date: Sun, 22 Mar 2026 09:14:00 +1300",
		"Message-ID: <msg001@co.nz>",
		"In-Reply-To: <msg000@co.nz>",
		"References: <msg000@co.nz>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"Friday 2pm works. I'll get the canary config updated before then.",
		"",
		"Can you confirm the rollback procedure is documented? Last time we had",
		"to improvise and it wasn't great.",
		"",
		"-- ",
		"Alice",
		"alice@co.nz",
	].join("\r\n"),
);

/** An HTML email for testing body conversion. */
export const HTML_EMAIL_SOURCE = Buffer.from(
	[
		"From: Bob <bob@example.com>",
		"To: Rob <rob@example.com>",
		"Subject: Invoice March 2026",
		"Date: Sat, 21 Mar 2026 17:45:00 +0000",
		"Message-ID: <msg002@example.com>",
		"MIME-Version: 1.0",
		'Content-Type: multipart/mixed; boundary="boundary123"',
		"",
		"--boundary123",
		"Content-Type: text/html; charset=utf-8",
		"",
		"<h1>Invoice</h1><p>Please find attached the March invoice.</p>",
		"--boundary123",
		"Content-Type: application/pdf; name=invoice-march.pdf",
		"Content-Disposition: attachment; filename=invoice-march.pdf",
		"Content-Transfer-Encoding: base64",
		"",
		"JVBERi0xLjQK",
		"--boundary123--",
	].join("\r\n"),
);

/** A reply email for thread testing. */
export const REPLY_EMAIL_SOURCE = Buffer.from(
	[
		"From: Rob <rob@example.com>",
		"To: Alice <alice@co.nz>",
		"CC: Platform Team <platform@example.com>",
		"Subject: Re: Deployment window Friday",
		"Date: Fri, 20 Mar 2026 14:30:00 +1300",
		"Message-ID: <msg000@co.nz>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"Hey team, we need a deployment window for the config migration.",
		"Friday afternoon work for everyone?",
	].join("\r\n"),
);

/** Envelope matching the simple email source. */
export const SIMPLE_ENVELOPE = {
	date: new Date("2026-03-22T09:14:00+13:00"),
	subject: "Re: Deployment window Friday",
	from: [{ name: "Alice", address: "alice@co.nz" }],
	to: [{ name: "Rob", address: "rob@example.com" }],
	cc: [{ name: "Platform Team", address: "platform@example.com" }],
	messageId: "<msg001@co.nz>",
	inReplyTo: "<msg000@co.nz>",
};

/** Envelope for the reply. */
export const REPLY_ENVELOPE = {
	date: new Date("2026-03-20T14:30:00+13:00"),
	subject: "Re: Deployment window Friday",
	from: [{ name: "Rob", address: "rob@example.com" }],
	to: [{ name: "Alice", address: "alice@co.nz" }],
	cc: [{ name: "Platform Team", address: "platform@example.com" }],
	messageId: "<msg000@co.nz>",
};

/** Envelope for the HTML email with attachment. */
export const HTML_ENVELOPE = {
	date: new Date("2026-03-21T17:45:00Z"),
	subject: "Invoice March 2026",
	from: [{ name: "Bob", address: "bob@example.com" }],
	to: [{ name: "Rob", address: "rob@example.com" }],
	messageId: "<msg002@example.com>",
};

/** Simple text/plain body structure. */
export const PLAIN_BODY_STRUCTURE = {
	type: "text/plain",
	parameters: { charset: "utf-8" },
	encoding: "7bit",
	size: 200,
};

/** Multipart body structure with an attachment. */
export const MULTIPART_BODY_STRUCTURE = {
	type: "multipart/mixed",
	childNodes: [
		{
			part: "1",
			type: "text/html",
			parameters: { charset: "utf-8" },
			encoding: "7bit",
			size: 100,
		},
		{
			part: "2",
			type: "application/pdf",
			parameters: { name: "invoice-march.pdf" },
			disposition: "attachment",
			dispositionParameters: { filename: "invoice-march.pdf" },
			encoding: "base64",
			size: 43008,
		},
	],
};

/** Build a FetchMessageObject-like result. */
export function makeFetchMessage(overrides: {
	uid: number;
	envelope: Record<string, unknown>;
	source?: Buffer;
	flags?: Set<string>;
	bodyStructure?: Record<string, unknown>;
}) {
	return {
		seq: overrides.uid,
		uid: overrides.uid,
		source: overrides.source,
		envelope: overrides.envelope,
		flags: overrides.flags ?? new Set(["\\Seen"]),
		bodyStructure: overrides.bodyStructure ?? PLAIN_BODY_STRUCTURE,
	};
}

/** Create a mock async iterator that yields given items. */
export function asyncIter<T>(items: T[]) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const item of items) {
				yield item;
			}
		},
	};
}
