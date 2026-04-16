import PQueue from "p-queue";
import { join, dirname } from "node:path";
import { mkdir, unlink, readdir, rmdir } from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import { DBManager } from "./db";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Download, DownloadStatus, FileKind } from "../mainview/lib/downloads-data";

export type ProgressCallback = (
	id: string,
	downloadedBytes: number,
	speedBps: number,
	activeSegments: number,
	status: DownloadStatus,
) => void;

export type CompleteCallback = (id: string, path: string) => void;
export type ErrorCallback = (id: string, error: string) => void;

const DEFAULT_CATEGORY_DIRS: Record<Download["category"], string> = {
	Video: "Videos",
	Audio: "Music",
	Software: "Downloads",
	Documents: "Documents",
	Archives: "Downloads",
	Images: "Pictures"
};

function detectKindByUnknownExt(filename: string): FileKind {
	const u = filename.toLowerCase();
	if (u.endsWith(".zip")) return "zip";
	if (u.endsWith(".mp4") || u.endsWith(".mkv") || u.endsWith(".avi")) return "mp4";
	if (u.endsWith(".iso")) return "iso";
	if (u.endsWith(".tar") || u.endsWith(".gz") || u.endsWith(".xz") || u.endsWith(".bz2")) return "tar";
	if (u.endsWith(".exe") || u.endsWith(".msi")) return "exe";
	if (u.endsWith(".pdf")) return "pdf";
	if (u.endsWith(".mp3") || u.endsWith(".wav") || u.endsWith(".flac") || u.endsWith(".ogg")) return "mp3";
	if (u.endsWith(".deb") || u.endsWith(".rpm")) return "deb";
	return "img";
}

function getSavePath(category: Download["category"], filename: string, customDir?: string): string {
	const home = process.env.HOME ?? "/tmp";
	const subDir = customDir || DEFAULT_CATEGORY_DIRS[category] || "Downloads";
	return join(home, subDir, "FluxDL", filename);
}

class DownloadsEngine {
	private queue = new Map<string, Download>();
	private db = new DBManager();
	
	private workers = new Map<string, Worker[]>();
	private controllers = new Map<string, AbortController>();
	private pQueue: PQueue;

	private onProgress: ProgressCallback;
	private onComplete: CompleteCallback;
	private onError: ErrorCallback;

	constructor(onProgress: ProgressCallback, onComplete: CompleteCallback, onError: ErrorCallback) {
		this.onProgress = onProgress;
		this.onComplete = onComplete;
		this.onError = onError;

		const maxConcurrent = parseInt(this.db.getSetting("max_concurrent_downloads", "3"), 10) || 3;
		this.pQueue = new PQueue({ concurrency: maxConcurrent });

		const stored = this.db.getAllDownloads();
		for (const d of stored) {
			if (d.status === "downloading" || d.status === "queued") {
				d.status = "queued";
				d.speedBps = 0;
				d.activeSegments = 0;
				this.queue.set(d.id, d);
				this.db.updateDownload(d);
				this.pQueue.add(() => this.downloadFile(d.id));
			} else {
				this.queue.set(d.id, d);
			}
		}
	}

	getAll(): Download[] {
		return Array.from(this.queue.values()).sort((a, b) => b.addedAt - a.addedAt);
	}

	start(url: string, category: string, segments: number): { id: string } {
		const id = crypto.randomUUID();
		const name = this.extractFilename(url);
		const cat = category as Download["category"];

		const download: Download = {
			id,
			name,
			url,
			kind: detectKindByUnknownExt(name),
			category: cat,
			sizeBytes: 0,
			downloadedBytes: 0,
			speedBps: 0,
			status: "queued",
			segments,
			activeSegments: 0,
			addedAt: Date.now(),
			source: this.extractHost(url),
		};

		this.queue.set(id, download);
		this.db.insertDownload(download);
		this.pQueue.add(() => this.downloadFile(id));
		return { id };
	}

	pause(id: string): boolean {
		const d = this.queue.get(id);
		if (!d || d.status !== "downloading") return false;

		this.controllers.get(id)?.abort("paused");
		this.controllers.delete(id);

		const downloadWorkers = this.workers.get(id);
		if (downloadWorkers) {
			for (const worker of downloadWorkers) {
				worker.postMessage({ type: "abort" });
				worker.terminate();
			}
			this.workers.delete(id);
		}

		this.updateStatus(id, { status: "paused", speedBps: 0, activeSegments: 0 });
		this.onProgress(id, d.downloadedBytes, 0, 0, "paused");
		return true;
	}

	resume(id: string): boolean {
		const d = this.queue.get(id);
		if (!d || (d.status !== "paused" && d.status !== "error")) return false;

		this.updateStatus(id, { status: "queued", speedBps: 0, activeSegments: 0 });
		this.pQueue.add(() => this.downloadFile(id));
		return true;
	}

	remove(id: string): boolean {
		if (!this.queue.has(id)) return false;
		
		this.controllers.get(id)?.abort("removed");
		this.controllers.delete(id);

		const downloadWorkers = this.workers.get(id);
		if (downloadWorkers) {
			for (const worker of downloadWorkers) {
				worker.postMessage({ type: "abort" });
				worker.terminate();
			}
			this.workers.delete(id);
		}

		this.queue.delete(id);
		this.db.deleteDownload(id);
		return true;
	}

	private updateStatus(id: string, patch: Partial<Download>): void {
		const d = this.queue.get(id);
		if (d) {
			const updated = { ...d, ...patch };
			this.queue.set(id, updated);
			this.db.updateDownload(updated);
		}
	}

	private async downloadFile(id: string): Promise<void> {
		const d = this.queue.get(id);
		if (!d || d.status === "done" || d.status === "downloading") return;

		const controller = new AbortController();
		this.controllers.set(id, controller);

		this.updateStatus(id, { status: "downloading", speedBps: 0 });

		const customCategoriesStr = this.db.getSetting("category_dirs", "{}");
		let customDir: string | undefined;
		try {
			const parsed = JSON.parse(customCategoriesStr);
			if (parsed[d.category] && typeof parsed[d.category] === "string") {
				customDir = parsed[d.category];
			}
		} catch {}

		const savePath = getSavePath(d.category, d.name, customDir);
		const partsDir = join(savePath + "_parts");

		try {
			await mkdir(dirname(savePath), { recursive: true });

			let headRes = await fetch(d.url, { method: "HEAD", signal: controller.signal });
			if (!headRes.ok) {
				headRes = await fetch(d.url, {
					method: "GET",
					headers: { "Range": "bytes=0-0" },
					signal: controller.signal
				});
			}

			const contentLengthHeader = headRes.headers.get("content-length");
			const acceptRanges = headRes.headers.get("accept-ranges") === "bytes";
			const totalSize = contentLengthHeader ? parseInt(contentLengthHeader) : 0;
			
			let numSegments = 1;
			if (acceptRanges && totalSize > 0) {
				numSegments = Math.max(1, d.segments);
			}

			this.updateStatus(id, { sizeBytes: totalSize });
			await mkdir(partsDir, { recursive: true });

			const ranges: { start: number; end: number }[] = [];
			const chunkSize = Math.floor(totalSize / numSegments);

			for (let i = 0; i < numSegments; i++) {
				const start = i * chunkSize;
				const end = i === numSegments - 1 ? totalSize - 1 : start + chunkSize - 1;
				ranges.push({ start, end });
			}

			if (totalSize === 0) {
				ranges[0] = { start: 0, end: -1 };
			}

			const partsProgress = new Map<number, number>();
			for (let i = 0; i < ranges.length; i++) partsProgress.set(i, 0);
			
			const activeWorkers = new Set<number>();
			const activeWorkerInstances: Worker[] = [];
			this.workers.set(id, activeWorkerInstances);

			this.updateStatus(id, { activeSegments: numSegments });
			
			const workerPromises = ranges.map((range, index) => {
				return new Promise<void>((resolve, reject) => {
					const workerUrl = new URL("download-worker.ts", import.meta.url).href;
					const worker = new Worker(workerUrl);
					
					activeWorkerInstances.push(worker);
					activeWorkers.add(index);

					const partPath = join(partsDir, `part.${index}`);
					worker.postMessage({
						url: d.url,
						startByte: range.start,
						endByte: range.end >= 0 ? range.end : Number.MAX_SAFE_INTEGER,
						segmentIndex: index,
						savePath: partPath,
					});

					worker.onmessage = (event) => {
						const msg = event.data;
						if (msg.type === "progress") {
							partsProgress.set(index, msg.downloadedBytes);
						} else if (msg.type === "completed") {
							activeWorkers.delete(index);
							worker.terminate();
							resolve();
						} else if (msg.type === "error") {
							worker.terminate();
							reject(new Error(`Worker ${index} failed: ${msg.error}`));
						}
					};
					worker.onerror = (err) => { worker.terminate(); reject(err); };
				});
			});

			let lastDownloadSweep = 0;
			let lastTimeSweep = Date.now();
			let currentEmaSpeed = 0;
			const EMA_ALPHA = 0.2;
			let tickCount = 0;

			const progressTicker = setInterval(() => {
				let totalDownloadedBytes = 0;
				for (const bytes of partsProgress.values()) totalDownloadedBytes += bytes;

				const now = Date.now();
				const elapsed = (now - lastTimeSweep) / 1000;

				if (elapsed >= 0.5) {
					const instantSpeed = (totalDownloadedBytes - lastDownloadSweep) / elapsed;
					currentEmaSpeed = currentEmaSpeed === 0
						? instantSpeed
						: (EMA_ALPHA * instantSpeed) + ((1 - EMA_ALPHA) * currentEmaSpeed);

					lastDownloadSweep = totalDownloadedBytes;
					lastTimeSweep = now;

					this.onProgress(id, totalDownloadedBytes, currentEmaSpeed, activeWorkers.size, "downloading");
					
					tickCount++;
					if (tickCount % 5 === 0) {
						this.updateStatus(id, { downloadedBytes: totalDownloadedBytes, speedBps: currentEmaSpeed, activeSegments: activeWorkers.size });
					}
				}
			}, 500);

			await Promise.all(workerPromises);
			clearInterval(progressTicker);

			this.updateStatus(id, { status: "downloading", speedBps: 0, activeSegments: 0 });
			const finalFile = Bun.file(savePath);
			const writer = finalFile.writer();
			
			for (let i = 0; i < numSegments; i++) {
				const partPath = join(partsDir, `part.${i}`);
				const partFile = Bun.file(partPath);
				if (await partFile.exists()) {
					for await (const chunk of partFile.stream()) {
						writer.write(chunk);
					}
					await unlink(partPath).catch(() => { });
				}
			}
			await writer.end();

			// File type resolution using magic bytes
			let finalKind = d.kind;
			try {
				const typeRes = await fileTypeFromFile(savePath);
				if (typeRes) {
					if (typeRes.mime.includes("video")) finalKind = "mp4";
					else if (typeRes.mime.includes("audio")) finalKind = "mp3";
					else if (typeRes.mime.includes("image")) finalKind = "img";
					else if (typeRes.ext === "zip") finalKind = "zip";
					else if (typeRes.ext === "pdf") finalKind = "pdf";
					else if (typeRes.ext === "tar" || typeRes.ext === "gz" || typeRes.ext === "bz2") finalKind = "tar";
					else if (typeRes.ext === "exe" || typeRes.ext === "msi") finalKind = "exe";
					else if (typeRes.ext === "rpm" || typeRes.ext === "deb") finalKind = "deb";
				}
			} catch (_) {}

			this.updateStatus(id, {
				downloadedBytes: totalSize || totalDownloadedBytes,
				sizeBytes: totalSize || totalDownloadedBytes,
				status: "done",
				speedBps: 0,
				activeSegments: 0,
				kind: finalKind
			});

			this.workers.delete(id);
			this.controllers.delete(id);

			// Optional checksum configuration
			const verifyChecksums = this.db.getSetting("verify_checksums", "false") === "true";
			if (verifyChecksums) {
				try {
					const hash = createHash("sha256");
					const stream = createReadStream(savePath);
					
					for await (const chunk of stream) {
						hash.update(chunk);
					}
					
					console.log(`[Checksum] ${d.name} -> SHA256: ${hash.digest("hex")}`);
				} catch (e) {
					console.error("Checksum generation failed:", e);
				}
			}

			// OS notifications
			const enableNotifications = this.db.getSetting("os_notifications", "true") === "true";
			if (enableNotifications) {
				try {
					Bun.$`notify-send "FluxDL Download Complete" "Successfully downloaded ${d.name}" --icon=emblem-downloads`.quiet();
				} catch (e) { }
			}

			this.onComplete(id, savePath);

		} catch (err: unknown) {
			this.controllers.delete(id);
			const workers = this.workers.get(id);
			if (workers) {
				for (const worker of workers) worker.terminate();
				this.workers.delete(id);
			}

			if (err instanceof Error && err.name === "AbortError" || String(err).includes("paused")) return;

			const msg = err instanceof Error ? err.message : String(err);
			this.updateStatus(id, {
				status: "error",
				speedBps: 0,
				activeSegments: 0,
				error: msg,
			});
			this.onError(id, msg);
		}
	}

	private extractFilename(url: string): string {
		try {
			const pathname = new URL(url).pathname;
			const name = pathname.split("/").pop();
			return name && name.trim() ? decodeURIComponent(name) : "download.bin";
		} catch {
			return "download.bin";
		}
	}

	private extractHost(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return "unknown";
		}
	}

	public updateMaxConcurrency(concurrency: number) {
		this.pQueue.concurrency = concurrency;
	}

	// ── Settings API ─────────────────────────────────────────────────────
	public getAllSettings(): Record<string, string> {
		return this.db.getAllSettings();
	}

	public updateSetting(key: string, value: string) {
		this.db.updateSetting(key, value);
		if (key === "max_concurrent_downloads") {
			this.updateMaxConcurrency(parseInt(value) || 3);
		}
	}
}

export { DownloadsEngine };
