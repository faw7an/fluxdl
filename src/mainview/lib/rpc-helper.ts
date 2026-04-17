import { Electroview } from "electrobun/view";
import { type AppRPC } from "@/shared/rpc";
import { uiLogger } from "./logger";

let electroview: Electroview<AppRPC> | null = null;

/**
 * Initializes the correct Electrobun RPC bridge using Electroview.
 */
type Handlers = {
	downloadProgress?: (payload: AppRPC["webview"]["messages"]["downloadProgress"]) => void;
	downloadComplete?: (payload: AppRPC["webview"]["messages"]["downloadComplete"]) => void;
	downloadError?: (payload: AppRPC["webview"]["messages"]["downloadError"]) => void;
};

let currentHandlers: Handlers = {};

/**
 * Initializes the correct Electrobun RPC bridge using Electroview.
 */
export function initRPC(messageHandlers?: Handlers): Electroview<AppRPC> {
	if (messageHandlers) {
		currentHandlers = { ...currentHandlers, ...messageHandlers };
	}

	if (electroview) return electroview;

	const rpc = Electroview.defineRPC<AppRPC>({
		handlers: {
			requests: {},
			messages: {
				downloadProgress: (p) => {
					uiLogger.info(`Received progress for ${p.id.substring(0,6)}: ${p.downloadedBytes} bytes`, "RPC");
					currentHandlers.downloadProgress?.(p);
				},
				downloadComplete: (p) => {
					uiLogger.info(`Received complete for ${p.id.substring(0,6)}`, "RPC");
					currentHandlers.downloadComplete?.(p);
				},
				downloadError: (p) => {
					uiLogger.error(`Received error for ${p.id.substring(0,6)}: ${p.error}`, "RPC");
					currentHandlers.downloadError?.(p);
				},
			},
		},
	});

	electroview = new Electroview({ rpc });
	return electroview;
}

export function getRPC() {
	return electroview?.rpc;
}

// For backward compatibility during migration
export async function waitForRPC() {
	return true;
}
