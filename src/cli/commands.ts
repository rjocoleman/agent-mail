import { writeFileSync } from "node:fs";
import type { AgentMailClient } from "../client.js";

/** Parse a string flag to a number, or return undefined. */
function num(val: string | undefined): number | undefined {
	if (val === undefined) return undefined;
	const n = Number(val);
	if (Number.isNaN(n)) return undefined;
	return n;
}

/** Parse CLI args into a flags map. Supports --key value and --flag (boolean). */
export function parseFlags(args: string[]): {
	command: string;
	flags: Record<string, string | boolean>;
} {
	const flags: Record<string, string | boolean> = {};
	let command = "";

	let i = 0;
	while (i < args.length) {
		const arg = args[i]!;

		if (!arg.startsWith("-") && !command) {
			command = arg;
			i++;
			continue;
		}

		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = args[i + 1];
			if (next && !next.startsWith("-")) {
				flags[key] = next;
				i += 2;
			} else {
				flags[key] = true;
				i++;
			}
		} else if (arg.startsWith("-")) {
			const key = arg.slice(1);
			const next = args[i + 1];
			if (next && !next.startsWith("-")) {
				flags[key] = next;
				i += 2;
			} else {
				flags[key] = true;
				i++;
			}
		} else {
			i++;
		}
	}

	return { command, flags };
}

/** Get a string flag value. */
function str(flags: Record<string, string | boolean>, key: string): string | undefined {
	const val = flags[key];
	return typeof val === "string" ? val : undefined;
}

/** Get a boolean flag value. */
function bool(flags: Record<string, string | boolean>, key: string): boolean {
	return flags[key] === true || flags[key] === "true";
}

export async function runCommand(
	client: AgentMailClient,
	command: string,
	flags: Record<string, string | boolean>,
): Promise<void> {
	switch (command) {
		case "folders": {
			const result = await client.folders();
			console.log(result);
			break;
		}

		case "list": {
			const result = await client.list({
				folder: str(flags, "folder"),
				limit: num(str(flags, "limit")),
				offset: num(str(flags, "offset")),
				unread_only: bool(flags, "unread"),
				since: str(flags, "since"),
				before: str(flags, "before"),
				from: str(flags, "from"),
			});
			console.log(result);
			break;
		}

		case "recent": {
			const result = await client.recent();
			console.log(result);
			break;
		}

		case "get": {
			const uid = num(str(flags, "uid"));
			if (uid === undefined) {
				console.error("Error: --uid is required");
				process.exit(1);
			}
			const result = await client.get({
				uid,
				folder: str(flags, "folder"),
				raw: bool(flags, "raw"),
				max_body_chars: num(str(flags, "max-chars")),
				include_quoted: bool(flags, "quoted"),
				include_headers: bool(flags, "headers"),
				summary_first: bool(flags, "summary"),
			});
			console.log(result);
			break;
		}

		case "thread": {
			const uid = num(str(flags, "uid"));
			if (uid === undefined) {
				console.error("Error: --uid is required");
				process.exit(1);
			}
			const result = await client.thread({
				uid,
				folder: str(flags, "folder"),
				max_body_chars: num(str(flags, "max-chars")),
				include_quoted: bool(flags, "quoted"),
				summary_first: bool(flags, "summary"),
			});
			console.log(result);
			break;
		}

		case "search": {
			const result = await client.search({
				folder: str(flags, "folder"),
				query: str(flags, "query"),
				from: str(flags, "from"),
				to: str(flags, "to"),
				subject: str(flags, "subject"),
				since: str(flags, "since"),
				before: str(flags, "before"),
				has_attachment: flags.attachment === true ? true : undefined,
				unread_only: bool(flags, "unread"),
				flagged_only: bool(flags, "flagged"),
				limit: num(str(flags, "limit")),
			});
			console.log(result);
			break;
		}

		case "attachment": {
			const uid = num(str(flags, "uid"));
			const part = str(flags, "part");
			if (uid === undefined || !part) {
				console.error("Error: --uid and --part are required");
				process.exit(1);
			}
			const result = await client.attachment({
				uid,
				part,
				folder: str(flags, "folder"),
			});

			const output = str(flags, "output") ?? str(flags, "o");
			if (output) {
				writeFileSync(output, result.content);
				console.log(`Saved ${result.filename} (${result.size} bytes) to ${output}`);
			} else {
				process.stdout.write(result.content);
			}
			break;
		}

		default:
			console.error(`Unknown command: ${command}`);
			process.exit(1);
	}
}
