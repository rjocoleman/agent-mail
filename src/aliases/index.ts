import type { Provider } from "../types.js";
import { fastmailAliases } from "./fastmail.js";
import { gmailAliases } from "./gmail.js";
import { outlookAliases } from "./outlook.js";

const providerMaps: Record<Exclude<Provider, "generic">, Record<string, string>> = {
	gmail: gmailAliases,
	fastmail: fastmailAliases,
	outlook: outlookAliases,
};

/**
 * Detect the email provider from the list of IMAP folder paths.
 * Falls back to host-based detection if folder heuristics are inconclusive.
 */
export function detectProvider(folderPaths: string[], host: string): Provider {
	if (folderPaths.some((p) => p.startsWith("[Gmail]/"))) return "gmail";
	if (host.includes("fastmail")) return "fastmail";
	if (host.includes("outlook.office365") || host.includes("outlook.com")) return "outlook";
	return "generic";
}

/**
 * Build a reverse lookup from IMAP path back to alias name for a provider.
 * Used when rendering folder listings (show alias name, parenthetical for real path).
 */
export function reverseAliases(
	provider: Provider,
	customAliases?: Record<string, string>,
): Map<string, string> {
	const reverse = new Map<string, string>();
	if (provider !== "generic") {
		for (const [alias, path] of Object.entries(providerMaps[provider])) {
			reverse.set(path, alias);
		}
	}
	if (customAliases) {
		for (const [alias, path] of Object.entries(customAliases)) {
			reverse.set(path, alias);
		}
	}
	return reverse;
}

/**
 * Resolve a folder name to the actual IMAP path.
 *
 * Resolution order:
 * 1. Exact match against known IMAP paths - use as-is
 * 2. User-provided custom aliases
 * 3. Detected provider's built-in alias map
 * 4. Literal passthrough (assume it's a real path)
 */
export function resolveFolder(
	name: string,
	provider: Provider,
	knownPaths: Set<string>,
	customAliases?: Record<string, string>,
): string {
	// 1. Exact IMAP path match
	if (knownPaths.has(name)) return name;

	// 2. Custom aliases take priority
	if (customAliases?.[name]) return customAliases[name];

	// 3. Provider built-in aliases
	if (provider !== "generic") {
		const providerMap = providerMaps[provider];
		if (providerMap[name]) return providerMap[name];
	}

	// 4. Literal passthrough
	return name;
}
