import Electrobun, { BrowserWindow, BrowserView, Updater, Tray, Utils } from "electrobun/bun";
import { DownloadsEngine } from "./downloads-engine";
import { logger } from "./logger";
import { join } from "node:path";
import process from "node:process";
import { dlopen, FFIType } from "bun:ffi";
import type { AppRPC } from "../shared/rpc";

// ── Native OS Wake Lock Setup ───────────────────────────────────────────
let win32WakeLock: any = null;
let wakeLockProc: import("bun").Subprocess | null = null;

if (process.platform === "win32") {
	try {
		const lib = dlopen("kernel32.dll", {
			SetThreadExecutionState: {
				args: [FFIType.u32],
				returns: FFIType.u32,
			},
		});
		win32WakeLock = lib.symbols.SetThreadExecutionState;
	} catch (e) {
		logger.warn("Could not bind Windows power management FFI", "System");
	}
}

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
			getDownloads: async () => {
				if (!engine) return [];
				return engine.getAll();
			},

			readClipboard: async () => {
				return Utils.clipboardReadText();
			},

			writeClipboard: async ({ text }) => {
				Utils.clipboardWriteText(text);
				return true;
			},

			startDownload: async (params: { url: string; category: string; segments: number; headers?: Record<string, string> }) => {
				if (!engine) throw new Error("Engine not initialized");
				return engine.start(params.url, params.category, params.segments, params.headers);
			},

			pauseDownload: async (params: { id: string }) => {
				if (!engine) return false;
				return engine.pause(params.id);
			},

			resumeDownload: async (params: { id: string }) => {
				if (!engine) return false;
				return engine.resume(params.id);
			},

			removeDownload: async (params: { id: string }) => {
				if (!engine) return false;
				return engine.remove(params.id);
			},

			getSettings: async () => {
				if (!engine) return {};
				return engine.getAllSettings();
			},

			updateSetting: async (params: { key: string; value: string }) => {
				if (!engine) return false;
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

			fetchUrlInfo: async (params: { url: string; headers?: Record<string, string> }) => {
				if (!engine) throw new Error("Engine not initialized");
				return engine.fetchUrlInfo(params.url, params.headers);
			},
			revealInExplorer: async ({ path }) => {
				try {
					const { dirname } = require("node:path");
					if (process.platform === "darwin") {
						await Bun.$`open -R ${path}`;
					} else if (process.platform === "win32") {
						await Bun.$`explorer /select,"${path}"`;
					} else {
						await Bun.$`xdg-open ${dirname(path)}`;
					}
					return true;
				} catch (e) {
					logger.error("Failed to reveal file in explorer", "System", e);
					return false;
				}
			},
			toggleDevTools: async () => {
				if (mainWindow) mainWindow.webview?.toggleDevTools();
				return true;
			},
			setWakeLock: async ({ active }) => {
				try {
					if (active) {
						if (process.platform === "win32" && win32WakeLock) {
							// ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
							win32WakeLock(0x80000000 | 0x00000001);
						} else if (process.platform === "darwin" && !wakeLockProc) {
							// Caffeinate: -s prevents system sleep
							wakeLockProc = Bun.spawn(["caffeinate", "-s"]);
						} else if (process.platform === "linux" && !wakeLockProc) {
							// Systemd standard power blocker
							wakeLockProc = Bun.spawn(["systemd-inhibit", "--what=idle:sleep", "--why=FluxDL_Downloading", "sleep", "infinity"]);
						}
						logger.info("OS Wake Lock ENGAGED", "System");
					} else {
						if (process.platform === "win32" && win32WakeLock) {
							// Revert to ES_CONTINUOUS (Clears requirements)
							win32WakeLock(0x80000000);
						} else if (wakeLockProc) {
							wakeLockProc.kill();
							wakeLockProc = null;
						}
						logger.info("OS Wake Lock RELEASED", "System");
					}
					return true;
				} catch (e) {
					logger.error("Failed to toggle Wake Lock", "System", e);
					return false;
				}
			},
		},
		messages: {},
	},
});

// ── Window Creation ──────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function showWindow() {
	if (mainWindow) {
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	mainWindow = new BrowserWindow({
		title: "FluxDL",
		url,
		frame: {
			width: 1280,
			height: 780,
			x: 200,
			y: 200,
		},
		renderer: "cef",
		rpc: myWebviewRPC,
	});
}

showWindow();

Electrobun.events.on("close", (e: any) => {
	if (mainWindow && e.data?.id === mainWindow.id) {
		mainWindow = null;
	}
});

// ── Tray Menu ─────────────────────────────────────────────────────────────
tray = new Tray({ title: "FluxDL" });
tray.setMenu([
	{ type: "normal", label: "Open FluxDL", action: "open" },
	{ type: "separator" },
	{ type: "normal", label: "Pause All", action: "pause-all" },
	{ type: "separator" },
	{ type: "normal", label: "Quit", action: "quit" }
]);

tray.on("tray-clicked", (e: any) => {
	const action = e.data?.action;
	if (action === "open") {
		showWindow();
	} else if (action === "pause-all") {
		engine.getAll().forEach(d => {
			if (d.status === "downloading") engine.pause(d.id);
		});
	} else if (action === "quit") {
		process.exit(0);
	}
});

// ── Download engine (late init to capture mainWindow) ─────────────────────
engine = new DownloadsEngine(
	// onProgress
	(id, downloadedBytes, speedBps, activeSegments, status) => {
		if (mainWindow) mainWindow.webview?.rpc?.send.downloadProgress({ id, downloadedBytes, speedBps, activeSegments, status });
	},
	// onComplete
	(id, path) => {
		if (mainWindow) mainWindow.webview?.rpc?.send.downloadComplete({ id, path });
	},
	// onError
	(id, error) => {
		if (mainWindow) mainWindow.webview?.rpc?.send.downloadError({ id, error });
	},
);

console.log("FluxDL started!");
