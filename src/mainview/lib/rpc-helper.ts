import { type AppRPC } from "@/shared/rpc";

interface ElectrobunWindow extends Window {
	electrobun?: {
		rpc: {
			request: AppRPC["bun"]["requests"];
			onMessage: (handler: (name: keyof AppRPC["bun"]["messages"] | string, payload: any) => void) => () => void;
		};
	};
}

export function getRPC() {
	return (window as unknown as ElectrobunWindow).electrobun?.rpc;
}
