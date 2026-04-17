import type { RPCSchema } from "electrobun/bun";
import type { Download } from "../mainview/lib/downloads-data";

export type { Download };

export type AppRPC = {
	bun: RPCSchema<{
		requests: {
			getDownloads: { params: Record<string, never>; response: Download[] };
			startDownload: {
				params: { url: string; category: string; segments: number; headers?: Record<string, string> };
				response: { id: string };
			};
			pauseDownload: { params: { id: string }; response: boolean };
			resumeDownload: { params: { id: string }; response: boolean };
			removeDownload: { params: { id: string }; response: boolean };
			getSettings: { params: Record<string, never>; response: Record<string, string> };
			updateSetting: { params: { key: string; value: string }; response: boolean };
			logMessage: { params: { level: "info" | "warn" | "error"; message: string; context?: string }; response: boolean };
			exportLogs: { params: Record<string, never>; response: string };
			fetchUrlInfo: { params: { url: string; headers?: Record<string, string> }; response: { name: string; sizeBytes: number; acceptRanges: boolean; headers?: Record<string, string>; error?: string } };
			revealInExplorer: { params: { path: string }; response: boolean };
			toggleDevTools: { params: Record<string, never>; response: boolean };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: Record<string, never>;
		messages: {
			downloadProgress: {
				id: string;
				downloadedBytes: number;
				speedBps: number;
				activeSegments: number;
				status: Download["status"];
			};
			downloadComplete: { id: string; path: string };
			downloadError: { id: string; error: string };
		};
	}>;
};
