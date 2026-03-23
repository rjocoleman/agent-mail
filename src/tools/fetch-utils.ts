import type { FetchMessageObject, FetchQueryObject, ImapFlow } from "imapflow";

const FETCH_BATCH_SIZE = 25;

/** Fetch messages in batches to avoid server limits on large UID ranges. */
export async function fetchInBatches(
	client: ImapFlow,
	uids: number[],
	options: FetchQueryObject,
): Promise<FetchMessageObject[]> {
	if (uids.length === 0) return [];
	if (uids.length <= FETCH_BATCH_SIZE) {
		const results: FetchMessageObject[] = [];
		for await (const msg of client.fetch(uids.join(","), options)) {
			results.push(msg);
		}
		return results;
	}

	const results: FetchMessageObject[] = [];
	for (let i = 0; i < uids.length; i += FETCH_BATCH_SIZE) {
		const batch = uids.slice(i, i + FETCH_BATCH_SIZE);
		for await (const msg of client.fetch(batch.join(","), options)) {
			results.push(msg);
		}
	}
	return results;
}
