import { Electroview } from "electrobun/view";
import { type AppRPC } from "@/shared/rpc";

let electroview: Electroview<AppRPC> | null = null;

/**
 * Initializes the correct Electrobun RPC bridge using Electroview.
 */
type Handlers = {
	downloadProgress?: (payload: AppRPC["bun"]["messages"]["downloadProgress"]) => void;
	downloadComplete?: (payload: AppRPC["bun"]["messages"]["downloadComplete"]) => void;
	downloadError?: (payload: AppRPC["bun"]["messages"]["downloadError"]) => void;
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
				downloadProgress: (p) => currentHandlers.downloadProgress?.(p),
				downloadComplete: (p) => currentHandlers.downloadComplete?.(p),
				downloadError: (p) => currentHandlers.downloadError?.(p),
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
