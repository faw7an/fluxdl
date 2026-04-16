import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import { DownloadsEngine } from "./downloads-engine";
import { logger } from "./logger";
import { join } from "node:path";
import process from "node:process";
import type { AppRPC } from "../shared/rpc";

process.on("uncaughtException", (err) => {
	logger.error("Uncaught Exception", "System", err);
});

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

// ── RPC Definition (Defined before Window) ───────────────────────────────
let engine: DownloadsEngine;

const myWebviewRPC = BrowserView.defineRPC<AppRPC>({
	handlers: {
		requests: {
			getDownloads: async () => engine.getAll(),

			startDownload: async (params: { url: string; category: string; segments: number }) =>
				engine.start(params.url, params.category, params.segments),

			pauseDownload: async (params: { id: string }) => engine.pause(params.id),

			resumeDownload: async (params: { id: string }) => engine.resume(params.id),

			removeDownload: async (params: { id: string }) => engine.remove(params.id),

			getSettings: async () => engine.getAllSettings(),

			updateSetting: async (params: { key: string; value: string }) => {
				engine.updateSetting(params.key, params.value);
				return true;
			},

			logMessage: async ({ level, message, context }) => {
				const logCtx = context || "UI";
				if (level === "error") logger.error(message, logCtx);
				else if (level === "warn") logger.warn(message, logCtx);
				else logger.info(message, logCtx);
				return true;
			},

			exportLogs: async () => {
				const home = process.env.HOME ?? "/tmp";
				const logFile = join(home, ".config", "FluxDL", "logs", "app.log");
				const file = Bun.file(logFile);
				if (!(await file.exists())) return "No logs found.";
				return await file.text();
			},

			fetchUrlInfo: async (params: { url: string }) => {
				return engine.fetchUrlInfo(params.url);
			},
		},
		messages: {},
	},
});

// ── Window Creation ──────────────────────────────────────────────────────
const mainWindow = new BrowserWindow({
	title: "FluxDL",
	url,
	frame: {
		width: 1280,
		height: 780,
		x: 200,
		y: 200,
	},
	rpc: myWebviewRPC,
});

// ── Download engine (late init to capture mainWindow) ─────────────────────
engine = new DownloadsEngine(
	// onProgress
	(id, downloadedBytes, speedBps, activeSegments, status) => {
		mainWindow.rpc.send.downloadProgress({ id, downloadedBytes, speedBps, activeSegments, status });
	},
	// onComplete
	(id, path) => {
		mainWindow.rpc.send.downloadComplete({ id, path });
	},
	// onError
	(id, error) => {
		mainWindow.rpc.send.downloadError({ id, error });
	},
);

console.log("FluxDL started!");
