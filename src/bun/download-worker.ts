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

export type WorkerMessage = 
	| WorkerLaunchData
	| { type: "abort" }
	| { type: "shrink"; newEndByte: number };

function log(level: "info" | "warn" | "error", message: string, segmentIndex: number | string) {
	postMessage({ type: "log", level, message: `[Worker ${segmentIndex}] ${message}` });
}

let activeEndByte = -1;

// @ts-ignore
self.onmessage = async (event: MessageEvent) => {
	const data = event.data as WorkerMessage;

	if ("type" in data) {
		if (data.type === "abort") {
			return;
		} else if (data.type === "shrink") {
			activeEndByte = data.newEndByte;
			log("info", `Shrunk endByte to ${activeEndByte}`, -1);
			return;
		}
	}

	const { url, startByte, endByte, segmentIndex, savePath, downloaded: initialDownloaded, headers: customHeaders } = data as WorkerLaunchData;

	if (activeEndByte === -1) {
		activeEndByte = endByte;
	}

	let downloaded = initialDownloaded || 0;
	let lastEmit = Date.now();
	let lastBytes = 0;

		try {
			await mkdir(dirname(savePath), { recursive: true });
			let currentStart = startByte + downloaded;
			
			if (currentStart > activeEndByte) {
			log("info", "Already downloaded this chunk completely.", segmentIndex);
			// Already downloaded this chunk
			postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });
			postMessage({ type: "completed", segmentIndex });
			return;
		}

		const headers: Record<string, string> = {
			"Range": `bytes=${currentStart}-${activeEndByte}`,
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

		log("info", `Starting fetch for range ${currentStart}-${activeEndByte}`, segmentIndex);

		const fh = await open(savePath, "r+");
		const reader = res.body.getReader();

		// Ensure we report base downloaded bytes first
		postMessage({ type: "progress", segmentIndex, downloadedBytes: downloaded, speedBps: 0 });

		while (true) {
			if (currentStart > activeEndByte) {
				log("info", `Reached new dynamic endByte (${activeEndByte}), exiting loop.`, segmentIndex);
				break;
			}

			const { done, value } = await reader.read();
			if (done) break;

			// If this chunk pushes us past the activeEndByte, slice it
			let bytesToWrite = value;
			const remainingBytes = (activeEndByte - currentStart) + 1;
			if (value.byteLength > remainingBytes) {
				bytesToWrite = value.slice(0, remainingBytes);
			}

			await fh.write(bytesToWrite, 0, bytesToWrite.length, currentStart);
			downloaded += bytesToWrite.byteLength;
			currentStart += bytesToWrite.byteLength;

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
