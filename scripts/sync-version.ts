#!/usr/bin/env bun

/**
 * Syncs the version from package.json into jsr.json.
 * Called by the npm `version` lifecycle hook.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const version = process.env.npm_package_version;

if (!version) {
	console.error("npm_package_version not set");
	process.exit(1);
}

const jsrPath = join(root, "jsr.json");
const jsr = JSON.parse(readFileSync(jsrPath, "utf-8"));
jsr.version = version;
writeFileSync(jsrPath, `${JSON.stringify(jsr, null, "\t")}\n`);
