declare var self: WorkerGlobalScope;

import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

export interface WorkerLaunchData {
	url: string;
	startByte: number;
	endByte: number; // inclusive
	segmentIndex: number;
	savePath: string; // The .fluxdl file
	downloaded: number; // Bytes already downloaded for this segment
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

	const { url, startByte, endByte, segmentIndex, savePath, downloaded: initialDownloaded, headers: customHeaders } = data as WorkerLaunchData;

	let downloaded = initialDownloaded || 0;
	let lastEmit = Date.now();
	let lastBytes = 0;

	try {
		await mkdir(dirname(savePath), { recursive: true });
		let currentStart = startByte + downloaded;
		
		// We write directly to the shared .fluxdl file
		const file = Bun.file(savePath);

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

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(new Error("Connection Timeout")), 15000);

		const fetchOptions: RequestInit = { 
			headers,
			signal: controller.signal,
			redirect: "follow"
		};

		let res: Response;
		try {
			res = await fetch(url, fetchOptions);
		} catch (e) {
			if (!(e instanceof Error && e.message === "Connection Timeout")) {
				res = await fetch(url, { ...fetchOptions, tls: { rejectUnauthorized: false } } as any);
			} else {
				throw e;
			}
		}
		clearTimeout(timeoutId);

		if (!res.ok && res.status !== 206) {
			log("error", `HTTP ${res.status} ${res.statusText}`, segmentIndex);
			throw new Error(`HTTP ${res.status} ${res.statusText}`);
		}

		if (!res.body) {
			log("error", "No response body received", segmentIndex);
			throw new Error("No response body");
		}

		log("info", `Starting fetch for range ${currentStart}-${endByte}`, segmentIndex);

		const fh = await open(savePath, "r+");
		const reader = res.body.getReader();

		// Ensure we report base downloaded bytes first
		postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			await fh.write(value, 0, value.length, currentStart);
			downloaded += value.byteLength;
			currentStart += value.byteLength;

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

		await fh.close();

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
