import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "FluxDL",
		identifier: "fluxdl.electrobun.dev",
		version: "1.0.2",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
	release: {
		baseUrl: "https://github.com/fluxdl/fluxdl/releases/latest/download", // Replace with actual hosting endpoint
	}
} satisfies ElectrobunConfig;
