import { create } from "zustand";
import { type Download } from "@/lib/downloads-data";
import { getRPC, initRPC } from "@/lib/rpc-helper";
import { toast } from "sonner";

export type FilterKey = "all" | "active" | "queued" | "done" | "error";
export type SortKey = "newest" | "oldest" | "name" | "size" | "progress";

interface DownloadStore {
	downloads: Download[];
	search: string;
	selectedId: string;
	filter: FilterKey;
	sortBy: SortKey;
	
	// Actions
	setSearch: (s: string) => void;
	setSelectedId: (id: string) => void;
	setFilter: (f: FilterKey) => void;
	setSortBy: (s: SortKey) => void;

	fetchDownloads: () => Promise<void>;
	addDownload: (params: { url: string; category: string; segments: number; headers?: Record<string, string> }) => Promise<void>;
	toggleDownload: (id: string) => void;
	removeDownload: (id: string) => void;
	pauseAll: () => void;
	resumeAll: () => void;
	clearCompleted: () => void;
	
	// RPC setup
	initializeRPC: () => void;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
	downloads: [],
	search: "",
	selectedId: "",
	filter: "all",
	sortBy: "newest",

	setSearch: (s) => set({ search: s }),
	setSelectedId: (id) => set({ selectedId: id }),
	setFilter: (f) => set({ filter: f }),
	setSortBy: (s) => set({ sortBy: s }),

	fetchDownloads: async () => {
		const rpc = getRPC();
		if (!rpc) return;
		const list = await rpc.request.getDownloads({});
		set({ downloads: list });
		if (list.length > 0 && !get().selectedId) {
			set({ selectedId: list[0].id });
		}
	},

	initializeRPC: () => {
		initRPC({
			downloadProgress: (params) => {
				set((state) => ({
					downloads: state.downloads.map((d) =>
						d.id === params.id 
							? { 
								...d, 
								downloadedBytes: params.downloadedBytes, 
								speedBps: params.speedBps, 
								activeSegments: params.activeSegments, 
								status: params.status 
							} 
							: d
					),
				}));
			},
			downloadComplete: ({ id, path }) => {
				set((state) => ({
					downloads: state.downloads.map((d) =>
						d.id === id
							? { ...d, status: "done", speedBps: 0, activeSegments: 0, downloadedBytes: d.sizeBytes }
							: d
					),
				}));
				const filename = path.split("/").pop() ?? "file";
				toast.success(`Completed: ${filename}`);
			},
			downloadError: ({ id, error }) => {
				set((state) => ({
					downloads: state.downloads.map((d) =>
						d.id === id
							? { ...d, status: "error", speedBps: 0, activeSegments: 0, error }
							: d
					),
				}));
				toast.error(`Download failed: ${error}`);
			},
		});
	},

	addDownload: async ({ url, category, segments, headers }) => {
		const rpc = getRPC();
		if (!rpc) return;

		const { id } = await rpc.request.startDownload({ url, category, segments, headers });
		
		const name = (() => {
			try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "download.bin"); }
			catch { return "download.bin"; }
		})();

		const newItem: Download = {
			id,
			name,
			url,
			kind: "img", // placeholder until engine updates
			category: category as any,
			sizeBytes: 0,
			downloadedBytes: 0,
			speedBps: 0,
			status: "queued",
			segments,
			activeSegments: 0,
			addedAt: Date.now(),
			source: new URL(url).hostname,
		};

		set((state) => ({
			downloads: [newItem, ...state.downloads],
			selectedId: id
		}));
		
		toast.success(`Queued: ${name}`);
	},

	toggleDownload: (id) => {
		const rpc = getRPC();
		if (!rpc) return;
		const d = get().downloads.find(x => x.id === id);
		if (!d) return;

		if (d.status === "downloading") {
			rpc.request.pauseDownload({ id });
		} else {
			rpc.request.resumeDownload({ id });
		}
	},

	removeDownload: (id) => {
		const rpc = getRPC();
		if (!rpc) return;
		
		rpc.request.removeDownload({ id }).then((success: boolean) => {
			if (success) {
				set(state => ({
					downloads: state.downloads.filter(x => x.id !== id),
					selectedId: state.selectedId === id ? "" : state.selectedId
				}));
			}
		});
	},

	pauseAll: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const active = get().downloads.filter(d => d.status === "downloading");
		active.forEach(d => rpc.request.pauseDownload({ id: d.id }));
		if (active.length > 0) toast("Paused all transfers");
	},

	resumeAll: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const paused = get().downloads.filter(d => d.status === "paused");
		paused.forEach(d => rpc.request.resumeDownload({ id: d.id }));
		if (paused.length > 0) toast("Resumed all transfers");
	},

	clearCompleted: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const done = get().downloads.filter(d => d.status === "done");
		done.forEach(d => rpc.request.removeDownload({ id: d.id }));
		set(state => ({
			downloads: state.downloads.filter(d => d.status !== "done")
		}));
		toast("Cleared completed downloads");
	}
}));
