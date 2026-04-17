import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "FluxDL",
		identifier: "fluxdl.electrobun.dev",
		version: "1.0.13",
	},
	build: {
		runtime: {
			exitOnLastWindowClosed: false,
		},
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"src/bun/download-worker.ts": "bun/download-worker.ts",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: true,
			icon: "src/mainview/assets/icon-512.png",
		},
		win: {
			bundleCEF: true,
			icon: "src/mainview/assets/icon-512.png",
		},
	},
	release: {
		baseUrl: "https://github.com/fluxdl/fluxdl/releases/latest/download", // Replace with actual hosting endpoint
	}
} satisfies ElectrobunConfig;
