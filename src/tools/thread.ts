import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AttachmentInfo } from "../processing/attachments.js";
import { extractAttachments } from "../processing/attachments.js";
import { processBody } from "../processing/body.js";
import { formatBytes, formatDateWithTz, formatSender } from "../processing/format.js";
import { summarise } from "../processing/summary.js";
import { collectThreadIds, findMissingIds, sortChronologically } from "../processing/thread.js";
import type { ParsedThreadInput } from "../schemas.js";
import type { MailConfig } from "../types.js";
import { MAX_THREAD_MESSAGES, MailError } from "../types.js";

interface ThreadMessage {
	uid: number;
	messageId: string;
	date: Date | undefined;
	from: string;
	body: string;
	summary?: string;
	attachments: AttachmentInfo[];
}

/**
 * Fetch a full conversation thread as a single markdown document.
 * Reconstructed from References/In-Reply-To headers.
 */
export async function thread(
	client: ImapFlow,
	input: ParsedThreadInput,
	config: MailConfig,
): Promise<string> {
	const lock = await client.getMailboxLock(input.folder);
	try {
		// 1. Fetch the seed message with full headers
		const seed = await client.fetchOne(
			String(input.uid),
			{ source: true, envelope: true, bodyStructure: true },
			{ uid: true },
		);

		if (!seed || !seed.source || !seed.envelope) {
			throw new MailError("NOT_FOUND", `Message UID ${input.uid} not found in ${input.folder}`);
		}

		const seedParsed = await simpleParser(seed.source, {});
		const seedHeaders = {
			messageId: seed.envelope.messageId,
			references: seedParsed.headers.get("references"),
			inReplyTo: seed.envelope.inReplyTo,
		};

		// 2. Collect all message IDs in the thread
		const expectedIds = collectThreadIds(seedHeaders);

		// 3. Search for messages matching those IDs (batch in groups of 20)
		const allUids = new Set<number>();
		allUids.add(seed.uid);

		for (const id of expectedIds) {
			try {
				const results = (await client.search(
					{ header: { "Message-ID": id } },
					{ uid: true },
				)) as number[];
				for (const uid of results) allUids.add(uid);
			} catch {
				// Some servers may not support header search
			}
		}

		// 4. Also search for replies to the seed
		if (seed.envelope.messageId) {
			try {
				const replies = (await client.search(
					{ header: { "In-Reply-To": seed.envelope.messageId } },
					{ uid: true },
				)) as number[];
				for (const uid of replies) allUids.add(uid);
			} catch {
				// Continue with what we have
			}
		}

		// 5. Fetch found messages (cap to avoid unbounded fetches)
		const threadMessages: ThreadMessage[] = [];
		const foundIds = new Set<string>();
		const cappedUids = [...allUids].slice(0, MAX_THREAD_MESSAGES * 2);

		for (const uid of cappedUids) {
			const msg = await client.fetchOne(
				String(uid),
				{ source: true, envelope: true, bodyStructure: true },
				{ uid: true },
			);
			if (!msg || !msg.source || !msg.envelope) continue;

			const parsed = await simpleParser(msg.source, {});
			if (msg.envelope.messageId) foundIds.add(msg.envelope.messageId);

			const body = processBody(parsed.text ?? undefined, parsed.html || undefined, {
				includeQuoted: input.include_quoted,
				maxBodyChars: input.max_body_chars,
			});

			let messageSummary: string | undefined;
			if (input.summary_first) {
				const fullBody = processBody(parsed.text ?? undefined, parsed.html || undefined, {
					includeQuoted: input.include_quoted,
					maxBodyChars: -1,
				});
				messageSummary = await summarise(fullBody, input.summarise, config.summarise);
			}

			const attachments = extractAttachments(msg.bodyStructure);

			threadMessages.push({
				uid,
				messageId: msg.envelope.messageId ?? "",
				date: msg.envelope.date ? new Date(msg.envelope.date) : undefined,
				from: formatSender(msg.envelope.from?.[0], 80),
				body,
				summary: messageSummary,
				attachments,
			});
		}

		// 6. Sort chronologically and apply cap
		const sorted = sortChronologically(threadMessages);
		let displayed: ThreadMessage[];
		let omitted = 0;

		if (sorted.length > MAX_THREAD_MESSAGES) {
			const first5 = sorted.slice(0, 5);
			const last45 = sorted.slice(Math.max(5, sorted.length - 45));
			displayed = [...first5, ...last45];
			omitted = sorted.length - displayed.length;
		} else {
			displayed = sorted;
		}

		// 7. Check completeness
		const missing = findMissingIds(expectedIds, foundIds);
		const isComplete = missing.length === 0;
		const totalExpected = expectedIds.length;
		const totalFound = displayed.length;

		// 8. Build output
		const subject = seed.envelope.subject ?? "(no subject)";
		const heading = isComplete
			? `# Thread: ${subject} (${totalFound} messages)`
			: `# Thread: ${subject} (${totalFound} of ${totalExpected} messages found)`;

		const participants = [...new Set(displayed.map((m) => m.from))].join(", ");
		const dates = displayed.filter((m) => m.date).map((m) => m.date!);
		const earliest =
			dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined;
		const latest =
			dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : undefined;

		const parts = [heading];

		const metaParts: string[] = [];
		metaParts.push(`**Participants:** ${participants}`);
		if (earliest && latest) {
			metaParts.push(
				`**Span:** ${formatDateWithTz(earliest, config.timezone)} - ${formatDateWithTz(latest, config.timezone)}`,
			);
		}
		parts.push(metaParts.join("\n"));

		if (!isComplete) {
			const notice = [
				`> **Thread incomplete.** ${missing.length} messages from the References chain were not found in ${input.folder}.`,
				"> They may have been deleted, moved, or exist in another folder (e.g. Sent).",
				`> Missing message IDs: ${missing.join(", ")}`,
			];
			parts.push(notice.join("\n"));
		}

		// Message bodies
		const allAttachments: {
			prefix: string;
			filename: string;
			size: number;
			mimeType: string;
			part: string;
		}[] = [];

		for (let i = 0; i < displayed.length; i++) {
			const msg = displayed[i]!;
			const num = i + 1;
			const total = displayed.length;
			const dateStr = msg.date ? formatDateWithTz(msg.date, config.timezone) : "(unknown date)";

			if (omitted > 0 && i === 5) {
				parts.push("---");
				parts.push(`[--- ${omitted} older messages omitted ---]`);
			}
			// Separator between messages (omission banner already includes one)
			if (!(omitted > 0 && i === 5)) {
				parts.push("---");
			}

			let messageBlock = `## [${num}/${total}] ${msg.from} - ${dateStr}`;
			if (msg.summary) {
				messageBlock += `\n\n> **Summary:** ${msg.summary}`;
			}
			messageBlock += `\n\n${msg.body}`;
			parts.push(messageBlock);

			for (const att of msg.attachments) {
				allAttachments.push({ prefix: `[${num}/${total}]`, ...att });
			}
		}

		if (allAttachments.length > 0) {
			parts.push("---");
			const lines = allAttachments.map(
				(a) =>
					`- ${a.prefix} \`${a.filename}\` (${formatBytes(a.size)}) - ${a.mimeType} [part ${a.part}]`,
			);
			parts.push(`**Attachments across thread:**\n\n${lines.join("\n")}`);
		}

		return parts.join("\n\n");
	} finally {
		lock.release();
	}
}
