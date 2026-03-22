import { createClient, MailError, AgentMailClient } from "../dist/index.js";

if (typeof createClient !== "function") throw new Error("createClient not exported");
if (typeof MailError !== "function") throw new Error("MailError not exported");
if (typeof AgentMailClient !== "function") throw new Error("AgentMailClient not exported");

const methods = ["folders", "list", "recent", "get", "thread", "search", "attachment"];
for (const method of methods) {
	if (typeof AgentMailClient.prototype[method] !== "function") {
		throw new Error(`missing method: ${method}`);
	}
}

try {
	await createClient({});
	throw new Error("should have thrown on empty config");
} catch (err) {
	if (!(err instanceof MailError) || err.code !== "INVALID_INPUT") {
		throw new Error(`expected INVALID_INPUT MailError, got: ${err}`);
	}
}

console.log("Node smoke test passed");
