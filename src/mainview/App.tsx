import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Search, Trash2, Settings } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Sidebar, type FilterKey } from "@/components/downloads/Sidebar";
import { DownloadRow } from "@/components/downloads/DownloadRow";
import { DetailPanel } from "@/components/downloads/DetailPanel";
import { SettingsDialog } from "@/components/downloads/SettingsDialog";
import { AddUrlModal } from "@/components/downloads/AddUrlDialog";
import { type Download, formatBytes } from "@/lib/downloads-data";
import { cn } from "@/lib/utils";

import { type AppRPC } from "@/shared/rpc";

// ── RPC helpers ──────────────────────────────────────────────────────────────
interface ElectrobunWindow extends Window {
	electrobun?: {
		rpc: {
			request: AppRPC["bun"]["requests"];
			onMessage: (handler: (name: keyof AppRPC["bun"]["messages"] | string, payload: any) => void) => () => void;
		};
	};
}

function getRPC() {
	return (window as unknown as ElectrobunWindow).electrobun?.rpc;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SUB_TABS = ["all", "downloading", "paused", "queued", "done"] as const;
type SubTab = (typeof SUB_TABS)[number];

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
	const [downloads, setDownloads] = useState<Download[]>([]);
	const [filter, setFilter] = useState<FilterKey>("all");
	const [subTab, setSubTab] = useState<SubTab>("all");
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string>("");
	const [addOpen, setAddOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "size" | "progress">("newest");

	// ── RPC bootstrap ──────────────────────────────────────────────
	useEffect(() => {
		const rpc = getRPC();
		if (!rpc) {
			console.warn("No Electrobun RPC available — running without backend.");
			return;
		}

		// Load initial queue from Bun
		rpc.request.getDownloads({}).then((list) => {
			setDownloads(list);
			if (list.length > 0) setSelectedId(list[0].id);
		});

		// Listen to live updates pushed by Bun
		const off = rpc.onMessage((name: any, payload: any) => {
			const p = payload as Record<string, any>;

			if (name === "downloadProgress") {
				const { id, downloadedBytes, speedBps, activeSegments, status } = p as {
					id: string;
					downloadedBytes: number;
					speedBps: number;
					activeSegments: number;
					status: Download["status"];
				};
				setDownloads((prev) =>
					prev.map((d) =>
						d.id === id ? { ...d, downloadedBytes, speedBps, activeSegments, status } : d,
					),
				);
			}

			if (name === "downloadComplete") {
				const { id } = p as { id: string; path: string };
				setDownloads((prev) =>
					prev.map((d) =>
						d.id === id
							? { ...d, status: "done", speedBps: 0, activeSegments: 0, downloadedBytes: d.sizeBytes }
							: d,
					),
				);
				// Show just the filename from path
				const filename = (p.path as string).split("/").pop() ?? "file";
				toast.success(`Completed: ${filename}`);
			}

			if (name === "downloadError") {
				const { id, error } = p as { id: string; error: string };
				setDownloads((prev) =>
					prev.map((d) =>
						d.id === id
							? { ...d, status: "error", speedBps: 0, activeSegments: 0, error }
							: d,
					),
				);
				toast.error(`Download failed: ${error}`);
			}
		});

		return () => off();
	}, []);

	// ── Actions ────────────────────────────────────────────────────
	const addDownload = ({ url, category, segments }: { url: string; category: string; segments: number }) => {
		const rpc = getRPC();
		if (!rpc) return;

		rpc.request.startDownload({ url, category, segments }).then(({ id }) => {
			// Optimistically add a queued entry while the engine fires progress messages
			const name = (() => {
				try { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "download.bin"); }
				catch { return "download.bin"; }
			})();
			const kind = (() => {
				const u = url.toLowerCase();
				if (u.endsWith(".zip")) return "zip" as const;
				if (u.endsWith(".mp4") || u.endsWith(".mkv")) return "mp4" as const;
				if (u.endsWith(".iso")) return "iso" as const;
				if (u.endsWith(".tar") || u.endsWith(".gz") || u.endsWith(".xz")) return "tar" as const;
				if (u.endsWith(".exe") || u.endsWith(".msi")) return "exe" as const;
				if (u.endsWith(".pdf")) return "pdf" as const;
				if (u.endsWith(".mp3") || u.endsWith(".wav")) return "mp3" as const;
				if (u.endsWith(".deb") || u.endsWith(".rpm")) return "deb" as const;
				return "img" as const;
			})();
			const host = (() => { try { return new URL(url).hostname; } catch { return "unknown"; } })();
			const newEntry: Download = {
				id, name, url, kind,
				category: category as Download["category"],
				sizeBytes: 0, downloadedBytes: 0, speedBps: 0,
				status: "queued", segments, activeSegments: 0,
				addedAt: Date.now(), source: host,
			};
			setDownloads((prev) => [newEntry, ...prev]);
			setSelectedId(id);
			toast.success(`Queued: ${name}`);
		});
	};

	const toggleOne = (id: string) => {
		const rpc = getRPC();
		if (!rpc) return;
		const d = downloads.find((x) => x.id === id);
		if (!d) return;

		if (d.status === "downloading") {
			rpc.request.pauseDownload({ id });
		} else if (d.status === "paused" || d.status === "error" || d.status === "queued") {
			rpc.request.resumeDownload({ id });
		}
	};

	const removeOne = (id: string) => {
		const rpc = getRPC();
		if (!rpc) return;
		rpc.request.removeDownload({ id }).then((ok) => {
			if (ok) {
				setDownloads((prev) => prev.filter((d) => d.id !== id));
				toast("Removed from queue");
			}
		});
	};

	const pauseAll = () => {
		const rpc = getRPC();
		if (!rpc) return;
		const anyActive = downloads.some((d) => d.status === "downloading");
		if (anyActive) {
			downloads.filter((d) => d.status === "downloading").forEach((d) => rpc.request.pauseDownload({ id: d.id }));
			toast("Paused all transfers");
		} else {
			downloads.filter((d) => d.status === "paused").forEach((d) => rpc.request.resumeDownload({ id: d.id }));
			toast("Resumed all transfers");
		}
	};

	const clearCompleted = () => {
		const rpc = getRPC();
		if (!rpc) return;
		const done = downloads.filter((d) => d.status === "done");
		done.forEach((d) => rpc.request.removeDownload({ id: d.id }));
		setDownloads((prev) => prev.filter((d) => d.status !== "done"));
		toast("Cleared completed downloads");
	};

	// ── Keyboard Shortcuts ─────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
				if (e.key === 'n') {
					e.preventDefault();
					setAddOpen(true);
				} else if (e.key === 'p') {
					e.preventDefault();
					pauseAll();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [downloads]);

	// ── Derived state ──────────────────────────────────────────────
	const counts = useMemo(
		() => ({
			all: downloads.length,
			active: downloads.filter((d) => d.status === "downloading").length,
			queued: downloads.filter((d) => d.status === "queued").length,
			done: downloads.filter((d) => d.status === "done").length,
			error: downloads.filter((d) => d.status === "error").length,
		}),
		[downloads],
	);

	const totalDownBps = downloads.reduce((s, d) => s + (d.status === "downloading" ? d.speedBps : 0), 0);
	const totalSize = downloads.reduce((s, d) => s + d.sizeBytes, 0);

	const filtered = useMemo(() => {
		let list = downloads;
		if (filter === "active") list = list.filter((d) => d.status === "downloading");
		else if (filter === "queued") list = list.filter((d) => d.status === "queued");
		else if (filter === "done") list = list.filter((d) => d.status === "done");
		else if (filter === "error") list = list.filter((d) => d.status === "error");
		if (subTab !== "all") list = list.filter((d) => d.status === subTab);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter((d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q));
		}
		const sorted = [...list];
		if (sortBy === "newest") sorted.sort((a, b) => b.addedAt - a.addedAt);
		if (sortBy === "oldest") sorted.sort((a, b) => a.addedAt - b.addedAt);
		if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
		if (sortBy === "size") sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
		if (sortBy === "progress") sorted.sort((a, b) => b.downloadedBytes / (b.sizeBytes || 1) - a.downloadedBytes / (a.sizeBytes || 1));
		return sorted;
	}, [downloads, filter, subTab, search, sortBy]);

	const selected = downloads.find((d) => d.id === selectedId) ?? filtered[0] ?? null;
	const anyActive = counts.active > 0;

	// ── Render ─────────────────────────────────────────────────────
	return (
		<div className="flex h-screen w-full overflow-hidden">
			<Sidebar
				filter={filter}
				onFilterChange={setFilter}
				counts={counts}
				totalDownBps={totalDownBps}
				totalUpBps={totalDownBps * 0.04}
			/>

			<main className="flex-1 flex flex-col overflow-hidden">
				{/* Topbar */}
				<header className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-surface-1">
					<div className="flex-1">
						<h1 className="text-[15px] font-semibold tracking-tight">Downloads</h1>
						<p className="text-[12px] text-muted-foreground-2 mt-0.5">
							{counts.active} active · {formatBytes(totalSize, 1)} total
						</p>
					</div>

					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground-2" />
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search downloads..."
							className="bg-surface-2 border border-border rounded-md pl-8 pr-3 py-1.5 text-[12px] w-[220px] outline-none focus:border-primary focus:bg-surface-3 transition-colors placeholder:text-muted-foreground-2"
						/>
					</div>

					<button
						onClick={pauseAll}
						className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-surface-2 border border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors"
					>
						{anyActive ? (<><Pause className="w-3.5 h-3.5" />Pause All</>) : (<><Play className="w-3.5 h-3.5" />Resume All</>)}
					</button>

					<button
						onClick={clearCompleted}
						disabled={counts.done === 0}
						className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-surface-2 border border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						<Trash2 className="w-3.5 h-3.5" />
						Clear Done
					</button>

					<button
						onClick={() => setSettingsOpen(true)}
						className="flex items-center gap-1.5 px-3 pt-1.5 pb-1.5 rounded-md text-[12px] font-medium bg-surface-2 border border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors"
					>
						<Settings className="w-3.5 h-3.5" />
					</button>

					<button
						onClick={() => setAddOpen(true)}
						className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-strong transition-colors"
						style={{ boxShadow: "var(--shadow-glow)" }}
					>
						<Plus className="w-3.5 h-3.5" />
						Add URL
					</button>
				</header>

				{/* Stats strip */}
				<div className="flex border-b border-border bg-surface-1 px-5">
					<Stat tone="success" pulse num={counts.active} label="Active" />
					<Stat tone="warning" num={downloads.filter((d) => d.status === "paused").length} label="Paused" />
					<Stat tone="primary" num={counts.queued} label="Queued" />
					<Stat tone="muted" num={counts.done} label="Done" />
					<Stat tone="destructive" num={counts.error} label="Failed" />
					<div className="ml-auto flex items-center px-5 py-3">
						<div className="text-right">
							<div className="font-mono text-[14px] text-success">↓ {formatBytes(totalDownBps, 1)}/s</div>
							<div className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-medium mt-0.5">Total throughput</div>
						</div>
					</div>
				</div>

				{/* Filter tabs */}
				<div className="flex items-center gap-1.5 px-5 py-3 border-b border-border">
					{SUB_TABS.map((t) => (
						<button
							key={t}
							onClick={() => setSubTab(t)}
							className={cn(
								"px-3 py-1 rounded-full text-[12px] font-medium border transition-colors capitalize",
								subTab === t
									? "bg-surface-3 text-primary border-input"
									: "border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
							)}
						>
							{t}
						</button>
					))}
					<div className="flex-1" />
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
						className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground outline-none cursor-pointer hover:text-foreground"
					>
						<option value="newest">Newest first</option>
						<option value="oldest">Oldest first</option>
						<option value="name">Name A–Z</option>
						<option value="size">Size desc.</option>
						<option value="progress">Progress</option>
					</select>
				</div>

				{/* List */}
				<div className="flex-1 overflow-y-auto px-3 py-2">
					{filtered.length === 0 ? (
						<div className="h-full flex flex-col items-center justify-center text-center px-6">
							<div className="text-[15px] font-medium">No downloads yet</div>
							<p className="text-[12px] text-muted-foreground-2 mt-1 max-w-sm">
								Click <strong>Add URL</strong> to start your first download.
							</p>
						</div>
					) : (
						filtered.map((d) => (
							<DownloadRow
								key={d.id}
								download={d}
								selected={selectedId === d.id}
								onSelect={() => setSelectedId(d.id)}
								onToggle={() => toggleOne(d.id)}
								onRemove={() => removeOne(d.id)}
							/>
						))
					)}
				</div>
			</main>

			<DetailPanel
				download={selected}
				onToggle={() => selected && toggleOne(selected.id)}
				onRemove={() => selected && removeOne(selected.id)}
			/>

			<AddUrlModal open={addOpen} onOpenChange={setAddOpen} onAdd={addDownload} />
			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} getRPC={getRPC} />
			<Toaster
				position="bottom-right"
				theme="dark"
				toastOptions={{
					style: {
						background: "var(--surface-1)",
						border: "1px solid var(--input)",
						color: "var(--foreground)",
						fontFamily: "var(--font-sans)",
					},
				}}
			/>
		</div>
	);
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function Stat({
	num, label, tone, pulse,
}: {
	num: number; label: string;
	tone: "success" | "warning" | "primary" | "muted" | "destructive";
	pulse?: boolean;
}) {
	const toneClass = { success: "bg-success", warning: "bg-warning", primary: "bg-primary", muted: "bg-muted-foreground-2", destructive: "bg-destructive" }[tone];
	return (
		<div className="flex items-center gap-2.5 px-5 py-3 border-r border-border">
			<span className={cn("w-2 h-2 rounded-full shrink-0", toneClass, pulse && num > 0 && "pulse-dot")} />
			<div>
				<div className="font-mono text-[16px] font-medium leading-none">{num}</div>
				<div className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-medium mt-1">{label}</div>
			</div>
		</div>
	);
}

export default App;
