import { type AppRPC } from "@/shared/rpc";

interface ElectrobunWindow extends Window {
	electrobun?: {
		rpc: {
			request: AppRPC["bun"]["requests"];
			onMessage: (handler: (name: keyof AppRPC["bun"]["messages"] | string, payload: any) => void) => () => void;
		};
	};
	__electrobun_rpc?: any;
	rpc?: any;
}

/**
 * Diagnostic utility to scan the window for the Electrobun bridge.
 * Useful for debugging Linux/Wayland injection issues.
 */
function scanForBridge(): any | null {
	const win = window as any;
	
	// 1. Check known locations
	if (win.electrobun?.rpc) return win.electrobun.rpc;
	if (win.__electrobun_rpc) return win.__electrobun_rpc;
	if (win.rpc?.request && typeof win.rpc.request === 'function') return win.rpc;

	// 2. Scan all properties for bridge-like signatures
	const candidates = Object.keys(win).filter(key => 
		key.toLowerCase().includes("rpc") || 
		key.toLowerCase().includes("electro")
	);

	for (const key of candidates) {
		const val = win[key];
		if (val && typeof val === 'object' && (val.request || val.onMessage)) {
			console.log(`[FluxDL Debug] Potential bridge found at window.${key}`);
			return val;
		}
	}

	return null;
}

export function getRPC() {
	return scanForBridge();
}

/**
 * Helper to wait for the RPC bridge to be ready.
 * Essential for apps running on Linux where injection can be slightly async.
 */
export async function waitForRPC(timeoutMs = 10000): Promise<boolean> {
	const start = Date.now();
	console.log(`[FluxDL Debug] Waiting for RPC bridge (timeout: ${timeoutMs}ms)...`);
	
	while (Date.now() - start < timeoutMs) {
		const rpc = getRPC();
		if (rpc) {
			console.log("[FluxDL Debug] RPC Bridge connected successfully.");
			return true;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	
	console.error(`[FluxDL Error] RPC Bridge failed to connect after ${timeoutMs}ms.`);
	// List everything for one final check
	console.log("[FluxDL Debug] Window Keys:", Object.keys(window).filter(k => !k.startsWith("webkit")));
	return false;
}
