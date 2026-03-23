/**
 * Internal Zod schemas. Not part of the public API.
 * Consumers should use the parse functions and types from types.ts.
 */

import { z } from "zod";
import type { Summariser } from "./types.js";

export const timeoutsSchema = z.object({
	connect: z.number().positive().optional().default(10_000),
	command: z.number().positive().optional().default(30_000),
	search: z.number().positive().optional().default(60_000),
});

export const mailConfigSchema = z.object({
	host: z.string().min(1),
	port: z.number().int().positive(),
	secure: z.boolean(),
	auth: z.object({
		user: z.string().min(1),
		pass: z.string().min(1),
	}),
	timezone: z.string().optional().default("UTC"),
	timeouts: timeoutsSchema.optional().default(() => ({
		connect: 10_000,
		command: 30_000,
		search: 60_000,
	})),
	/** IP version preference. 4 = IPv4 only, 6 = IPv6 only, 0 = both (default). Useful for networks with flaky IPv6. */
	ip_family: z
		.union([z.literal(0), z.literal(4), z.literal(6)])
		.optional()
		.default(4),
	/** TLS connection overrides. `servername` sets SNI hostname, `rejectUnauthorized` controls cert validation. */
	tls: z
		.optional(
			z.object({
				/** SNI hostname override. Defaults to `host`. */
				servername: z.string().optional(),
				/** Set to `false` to disable certificate validation (not recommended). */
				rejectUnauthorized: z.boolean().optional(),
			}),
		)
		.default({}),
	summarise: z.optional(z.custom<Summariser>()),
	folderAliases: z.optional(z.record(z.string(), z.string())),
	sanitiseQuery: z.boolean().optional().default(true),
	onConnectionError: z.optional(z.custom<(error: Error) => void>()),
	onClose: z.optional(z.custom<() => void>()),
	autoReconnect: z.boolean().optional().default(false),
	maxReconnectAttempts: z.number().int().min(1).max(10).optional().default(3),
});

export const listInputSchema = z.object({
	folder: z.string().optional().default("INBOX"),
	limit: z.number().int().min(1).max(50).optional().default(20),
	offset: z.number().int().min(0).optional().default(0),
	unread_only: z.boolean().optional().default(false),
	since: z.string().optional(),
	before: z.string().optional(),
	from: z.string().optional(),
});

export const getInputSchema = z.object({
	uid: z.number().int().positive(),
	folder: z.string().optional().default("INBOX"),
	raw: z.boolean().optional().default(false),
	max_body_chars: z.number().int().optional().default(8_000),
	include_quoted: z.boolean().optional().default(false),
	include_headers: z.boolean().optional().default(false),
	summary_first: z.boolean().optional().default(false),
	summarise: z.optional(z.custom<Summariser>()),
});

export const threadInputSchema = z.object({
	uid: z.number().int().positive(),
	folder: z.string().optional().default("INBOX"),
	max_body_chars: z.number().int().optional().default(4_000),
	include_quoted: z.boolean().optional().default(false),
	summary_first: z.boolean().optional().default(false),
	summarise: z.optional(z.custom<Summariser>()),
});

export const searchInputSchema = z.object({
	folder: z.string().optional().default("INBOX"),
	query: z
		.string()
		.optional()
		.describe(
			"Plain substring match against message body. No boolean operators or wildcards by default.",
		),
	from: z.string().optional(),
	to: z.string().optional(),
	subject: z.string().optional(),
	since: z.string().optional(),
	before: z.string().optional(),
	has_attachment: z.boolean().optional(),
	unread_only: z.boolean().optional().default(false),
	flagged_only: z.boolean().optional().default(false),
	limit: z.number().int().min(1).max(50).optional().default(10),
});

export const attachmentInputSchema = z.object({
	uid: z.number().int().positive(),
	part: z.string().min(1),
	folder: z.string().optional().default("INBOX"),
});

// Parsed output types for internal use. Matches the explicit interfaces in types.ts
// but with all defaults applied by Zod.
export type ParsedMailConfig = z.output<typeof mailConfigSchema>;
export type ParsedListInput = z.output<typeof listInputSchema>;
export type ParsedGetInput = z.output<typeof getInputSchema>;
export type ParsedThreadInput = z.output<typeof threadInputSchema>;
export type ParsedSearchInput = z.output<typeof searchInputSchema>;
export type ParsedAttachmentInput = z.output<typeof attachmentInputSchema>;
