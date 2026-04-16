declare var self: WorkerGlobalScope;

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface WorkerLaunchData {
	url: string;
	startByte: number;
	endByte: number; // inclusive
	segmentIndex: number;
	savePath: string; // The .part.N file
}

self.onmessage = async (event: MessageEvent) => {
	const data = event.data as WorkerLaunchData | { type: "abort" };

	if ("type" in data && data.type === "abort") {
		// Native worker doesn't strictly have an external abort controller 
		// if we aren't storing the fetch controller globally, but we can call process.exit()
		process.exit(0);
		return;
	}

	const { url, startByte, endByte, segmentIndex, savePath } = data as WorkerLaunchData;

	let downloaded = 0;
	let lastEmit = Date.now();
	let lastBytes = 0;

	try {
		await mkdir(dirname(savePath), { recursive: true });
		let currentStart = startByte;
		
		// If part file exists, we resume from its size
		const file = Bun.file(savePath);
		if (await file.exists()) {
			downloaded = file.size;
			currentStart += downloaded;
		}

		if (currentStart > endByte) {
			// Already downloaded this chunk
			postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });
			postMessage({ type: "completed", segmentIndex });
			return;
		}

		const headers: Record<string, string> = {
			"Range": `bytes=${currentStart}-${endByte}`
		};

		const res = await fetch(url, { headers });

		if (!res.ok && res.status !== 206) {
			throw new Error(`HTTP ${res.status} ${res.statusText}`);
		}

		if (!res.body) throw new Error("No response body");

		const writer = file.writer();
		const reader = res.body.getReader();

		// Ensure we report base downloaded bytes first
		postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			writer.write(value);
			downloaded += value.byteLength;

			const now = Date.now();
			const elapsed = (now - lastEmit) / 1000;

			if (elapsed >= 0.2) {
				const speedBps = (downloaded - lastBytes) / elapsed;
				lastBytes = downloaded;
				lastEmit = now;
				
				postMessage({ 
					type: "progress", 
					segmentIndex, 
					downloadedBytes: downloaded, 
					speedBps 
				});
			}
		}

		await writer.end();

		// Final emit
		postMessage({ 
			type: "progress", 
			segmentIndex, 
			downloadedBytes: downloaded, 
			speedBps: 0 
		});
		postMessage({ type: "completed", segmentIndex });

	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		postMessage({ type: "error", segmentIndex, error: errorMessage });
	}
};
