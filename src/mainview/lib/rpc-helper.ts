import { type AppRPC } from "@/shared/rpc";

interface ElectrobunWindow extends Window {
	electrobun?: {
		rpc: {
			request: AppRPC["bun"]["requests"];
			onMessage: (handler: (name: keyof AppRPC["bun"]["messages"] | string, payload: any) => void) => () => void;
		};
	};
}

/**
 * Robustly retrieves the Electrobun RPC bridge.
 * Returns null if the bridge is not yet injected or available.
 */
export function getRPC() {
	const win = window as unknown as ElectrobunWindow;
	
	// Check for standard high-level bridge
	if (win.electrobun?.rpc) {
		return win.electrobun.rpc;
	}

	// Logging for diagnosis if called while missing
	if (process.env.NODE_ENV !== "production") {
		console.warn("RPC bridge requested but window.electrobun.rpc is missing.");
	}

	return null;
}

/**
 * Helper to wait for the RPC bridge to be ready.
 * Useful for startup sequences.
 */
export async function waitForRPC(timeoutMs = 2000): Promise<AppRPC["bun"]["requests"] | null> {
	const start = Date.now();
	
	while (Date.now() - start < timeoutMs) {
		const rpc = getRPC();
		if (rpc) return rpc.request;
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	
	return null;
}
