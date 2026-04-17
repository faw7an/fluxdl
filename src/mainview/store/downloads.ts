import { create } from "zustand";
import { type Download } from "@/lib/downloads-data";
import { getRPC, initRPC } from "@/lib/rpc-helper";
import { toast } from "sonner";

export type FilterKey = "all" | "active" | "queued" | "done" | "error";
export type SortKey = "newest" | "oldest" | "name" | "size" | "progress";

interface DownloadStore {
	downloadsById: Record<string, Download>;
	downloadIds: string[];
	counts: {
		all: number;
		active: number;
		queued: number;
		done: number;
		error: number;
		paused: number;
	};
	totalDownBps: number;
	totalSize: number;
	totalConnections: number;
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
	resumeErrored: () => void;
	clearCompleted: () => void;
	
	// RPC setup
	initializeRPC: () => void;
}

type ProgressParams = {
	id: string;
	downloadedBytes: number;
	speedBps: number;
	activeSegments: number;
	status: Download["status"];
};

const PROGRESS_FLUSH_MS = 250;
const pendingProgress = new Map<string, ProgressParams>();
const progressTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearProgressTimer = (id: string) => {
	const timer = progressTimers.get(id);
	if (timer) clearTimeout(timer);
	progressTimers.delete(id);
	pendingProgress.delete(id);
};

const flushProgress = (
	id: string,
	set: (fn: (state: DownloadStore) => Partial<DownloadStore>) => void,
) => {
	const latest = pendingProgress.get(id);
	if (latest) {
		set((state) => applyProgressUpdate(state, latest));
	}
	clearProgressTimer(id);
};

const buildStats = (downloadIds: string[], downloadsById: Record<string, Download>) => {
	let active = 0;
	let queued = 0;
	let done = 0;
	let error = 0;
	let paused = 0;
	let totalDownBps = 0;
	let totalSize = 0;
	let totalConnections = 0;

	for (const id of downloadIds) {
		const download = downloadsById[id];
		if (!download) continue;
		totalSize += download.sizeBytes;
		if (download.status === "downloading") {
			active += 1;
			totalDownBps += download.speedBps;
			totalConnections += download.activeSegments;
		} else if (download.status === "queued") {
			queued += 1;
		} else if (download.status === "done") {
			done += 1;
		} else if (download.status === "error") {
			error += 1;
		} else if (download.status === "paused") {
			paused += 1;
		}
	}

	return {
		counts: {
			all: downloadIds.length,
			active,
			queued,
			done,
			error,
			paused,
		},
		totalDownBps,
		totalSize,
		totalConnections,
	};
};

const applyProgressUpdate = (
	state: DownloadStore,
	params: ProgressParams,
): Partial<DownloadStore> => {
	const existing = state.downloadsById[params.id];
	if (!existing) return {};

	const next = {
		...existing,
		downloadedBytes: params.downloadedBytes,
		speedBps: params.speedBps,
		activeSegments: params.activeSegments,
		status: params.status,
	};

	let totalDownBps = state.totalDownBps;
	let totalConnections = state.totalConnections;
	const counts = { ...state.counts };

	const adjustCount = (status: Download["status"], delta: number) => {
		if (status === "downloading") counts.active += delta;
		else if (status === "queued") counts.queued += delta;
		else if (status === "done") counts.done += delta;
		else if (status === "error") counts.error += delta;
		else if (status === "paused") counts.paused += delta;
	};

	if (existing.status !== next.status) {
		adjustCount(existing.status, -1);
		adjustCount(next.status, 1);
	}

	if (existing.status === "downloading") {
		totalDownBps -= existing.speedBps;
		totalConnections -= existing.activeSegments;
	}
	if (next.status === "downloading") {
		totalDownBps += next.speedBps;
		totalConnections += next.activeSegments;
	}

	return {
		downloadsById: {
			...state.downloadsById,
			[params.id]: next,
		},
		counts,
		totalDownBps: Math.max(0, totalDownBps),
		totalConnections: Math.max(0, totalConnections),
		// totalSize is unchanged by progress updates
		totalSize: state.totalSize,
	};
};

export const useDownloadStore = create<DownloadStore>((set, get) => ({
	downloadsById: {},
	downloadIds: [],
	counts: {
		all: 0,
		active: 0,
		queued: 0,
		done: 0,
		error: 0,
		paused: 0,
	},
	totalDownBps: 0,
	totalSize: 0,
	totalConnections: 0,
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
		const downloadsById = Object.fromEntries(list.map((item: Download) => [item.id, item]));
		const downloadIds = list.map((item: Download) => item.id);
		const stats = buildStats(downloadIds, downloadsById);
		set({ downloadsById, downloadIds, ...stats });
		if (downloadIds.length > 0 && !get().selectedId) {
			set({ selectedId: downloadIds[0] });
		}
	},

	initializeRPC: () => {
		initRPC({
			downloadProgress: (params) => {
				pendingProgress.set(params.id, params);
				if (!progressTimers.has(params.id)) {
					const timer = setTimeout(() => {
						flushProgress(params.id, set);
					}, PROGRESS_FLUSH_MS);
					progressTimers.set(params.id, timer);
				}
			},
			downloadComplete: ({ id, path }) => {
				clearProgressTimer(id);
				set((state) => {
					const existing = state.downloadsById[id];
					if (!existing) return {};
					const nextState = applyProgressUpdate(state, {
						id,
						downloadedBytes: existing.sizeBytes,
						speedBps: 0,
						activeSegments: 0,
						status: "done",
					});
					const downloadsById = nextState.downloadsById ?? state.downloadsById;
					return {
						...nextState,
						downloadsById,
					};
				});
				const filename = path.split("/").pop() ?? "file";
				toast.success(`Completed: ${filename}`);
			},
			downloadError: ({ id, error }) => {
				clearProgressTimer(id);
				set((state) => {
					const existing = state.downloadsById[id];
					if (!existing) return {};
					const nextState = applyProgressUpdate(state, {
						id,
						downloadedBytes: existing.downloadedBytes,
						speedBps: 0,
						activeSegments: 0,
						status: "error",
					});
					const updated = nextState.downloadsById ?? state.downloadsById;
					return {
						...nextState,
						downloadsById: {
							...updated,
							[id]: {
								...updated[id],
								error,
								status: "error",
							},
						},
					};
				});
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
			downloadsById: {
				...state.downloadsById,
				[id]: newItem,
			},
			downloadIds: [id, ...state.downloadIds],
			selectedId: id,
			...buildStats([id, ...state.downloadIds], {
				...state.downloadsById,
				[id]: newItem,
			}),
		}));
		
		toast.success(`Queued: ${name}`);
	},

	toggleDownload: (id) => {
		const rpc = getRPC();
		if (!rpc) return;
		const d = get().downloadsById[id];
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
				clearProgressTimer(id);
				const { downloadIds, downloadsById } = get();
				const nextIds = downloadIds.filter((downloadId) => downloadId !== id);
				const nextById = Object.fromEntries(
					Object.entries(downloadsById).filter(([key]) => key !== id),
				);
				set(() => ({
					downloadsById: nextById,
					downloadIds: nextIds,
					selectedId: get().selectedId === id ? "" : get().selectedId,
					...buildStats(nextIds, nextById),
				}));
			}
		});
	},

	pauseAll: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const active = get().downloadIds
			.map((id) => get().downloadsById[id])
			.filter((d) => d?.status === "downloading");
		active.forEach(d => rpc.request.pauseDownload({ id: d.id }));
		if (active.length > 0) toast("Paused all transfers");
	},

	resumeAll: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const paused = get().downloadIds
			.map((id) => get().downloadsById[id])
			.filter((d) => d && (d.status === "paused" || d.status === "queued" || d.status === "error"));
		paused.forEach(d => rpc.request.resumeDownload({ id: d.id }));
		toast("Resuming all downloads");
	},
	resumeErrored: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const errored = get().downloadIds
			.map((id) => get().downloadsById[id])
			.filter((d) => d?.status === "error");
		errored.forEach(d => rpc.request.resumeDownload({ id: d.id }));
	},
	clearCompleted: () => {
		const rpc = getRPC();
		if (!rpc) return;
		const done = get().downloadIds
			.map((id) => get().downloadsById[id])
			.filter((d) => d?.status === "done");
		done.forEach(d => rpc.request.removeDownload({ id: d.id }));
		done.forEach((d) => clearProgressTimer(d.id));
		const { downloadIds, downloadsById } = get();
		const nextIds = downloadIds.filter((id) => downloadsById[id]?.status !== "done");
		const nextById = Object.fromEntries(
			Object.entries(downloadsById).filter(([, download]) => download.status !== "done"),
		);
		set(() => ({
			downloadsById: nextById,
			downloadIds: nextIds,
			...buildStats(nextIds, nextById),
		}));
		toast("Cleared completed downloads");
	}
}));
