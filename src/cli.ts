#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFlags, runCommand } from "./cli/commands.js";
import { loadConfig, resolveConfigPath } from "./cli/config.js";
import { printCommandHelp, printUsage } from "./cli/help.js";
import { AgentMailClient } from "./client.js";
import { MailError } from "./types.js";

const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8"));
const VERSION = pkg.version as string;

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const { command, flags } = parseFlags(args);

	// Global flags
	if (flags.version) {
		console.log(VERSION);
		return;
	}

	if (flags.help && !command) {
		printUsage();
		return;
	}

	if (flags.help && command) {
		printCommandHelp(command);
		return;
	}

	if (!command) {
		printUsage();
		process.exit(1);
	}

	// Load config
	const configPath = resolveConfigPath(typeof flags.config === "string" ? flags.config : undefined);
	const config = loadConfig(configPath);

	// Connect and run
	const client = new AgentMailClient(config);
	await client.connect();
	try {
		await runCommand(client, command, flags);
	} finally {
		await client.disconnect();
	}
}

main().catch((err) => {
	if (err instanceof MailError) {
		console.error(`Error [${err.code}]: ${err.message}`);
	} else {
		console.error(err);
	}
	process.exit(1);
});
