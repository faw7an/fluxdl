declare var self: WorkerGlobalScope;

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface WorkerLaunchData {
	url: string;
	startByte: number;
	endByte: number; // inclusive
	segmentIndex: number;
	savePath: string; // The .part.N file
	headers?: Record<string, string>;
}

function log(level: "info" | "warn" | "error", message: string, segmentIndex: number) {
	postMessage({ type: "log", level, message: `[Worker ${segmentIndex}] ${message}` });
}

self.onmessage = async (event: MessageEvent) => {
	const data = event.data as WorkerLaunchData | { type: "abort" };

	if ("type" in data && data.type === "abort") {
		// Native worker doesn't strictly have an external abort controller 
		// if we aren't storing the fetch controller globally. 
		// Returning will allow the task to end normally or wait for terminate()
		return;
	}

	const { url, startByte, endByte, segmentIndex, savePath, headers: customHeaders } = data as WorkerLaunchData;

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
			log("info", "Already downloaded this chunk completely.", segmentIndex);
			// Already downloaded this chunk
			postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });
			postMessage({ type: "completed", segmentIndex });
			return;
		}

		const headers: Record<string, string> = {
			"Range": `bytes=${currentStart}-${endByte}`,
			"User-Agent": "FluxDL/1.0.7 (Electrobun; Multi-Segment Download Manager)",
			...(customHeaders || {})
		};

		const fetchOptions: RequestInit = { 
			headers,
			redirect: "follow"
		};

		let res: Response;
		try {
			res = await fetch(url, fetchOptions);
		} catch (e) {
			// Fallback for systems with broken CA stores
			res = await fetch(url, { ...fetchOptions, tls: { rejectUnauthorized: false } } as any);
		}

		if (!res.ok && res.status !== 206) {
			log("error", `HTTP ${res.status} ${res.statusText}`, segmentIndex);
			throw new Error(`HTTP ${res.status} ${res.statusText}`);
		}

		if (!res.body) {
			log("error", "No response body received", segmentIndex);
			throw new Error("No response body");
		}

		log("info", `Starting fetch for range ${currentStart}-${endByte}`, segmentIndex);

		// ✅ FIX: Use position parameter to append to partial file instead of overwriting from 0
		const writer = file.writer({ position: downloaded });
		const reader = res.body.getReader();

		// Ensure we report base downloaded bytes first
		postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			writer.write(value);
			downloaded += value.byteLength;

			// Optimized tracking: Only check clock every 64KB to save CPU
			if (downloaded - lastBytes > 65536) {
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
		log("error", `Segment fetch failed: ${errorMessage}`, segmentIndex ?? "unknown");
		postMessage({ type: "error", segmentIndex, error: errorMessage });
	}
};
