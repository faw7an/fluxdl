import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Search, Trash2, Settings } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Sidebar } from "@/components/downloads/Sidebar";
import { DownloadRow } from "@/components/downloads/DownloadRow";
import { DetailPanel } from "@/components/downloads/DetailPanel";
import { SettingsDialog } from "@/components/downloads/SettingsDialog";
import { AddUrlModal } from "@/components/downloads/AddUrlDialog";
import { formatBytes } from "@/lib/downloads-data";
import { cn } from "@/lib/utils";
import { useDownloadStore } from "@/store/downloads";
import { useClipboardCapture } from "@/hooks/use-clipboard";

// ── Constants ─────────────────────────────────────────────────────────────────
const SUB_TABS = ["all", "downloading", "paused", "queued", "done"] as const;
type SubTab = (typeof SUB_TABS)[number];

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
	const {
		downloads,
		filter,
		setFilter,
		search,
		setSearch,
		selectedId,
		setSelectedId,
		sortBy,
		setSortBy,
		initializeRPC,
		fetchDownloads,
		addDownload,
		pauseAll,
		resumeAll,
		clearCompleted,
		toggleDownload,
		removeDownload,
	} = useDownloadStore();

	const [subTab, setSubTab] = useState<SubTab>("all");
	const [addOpen, setAddOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [clipboardUrl, setClipboardUrl] = useState("");

	// ── Clipboard auto-capture hook ─────────────────────────────────────────────
	useClipboardCapture((url) => {
		setClipboardUrl(url);
		setAddOpen(true);
	});

	// ── RPC sync and message handlers ───────────────────────────────────────────
	useEffect(() => {
		initializeRPC();
		fetchDownloads();
	}, []);

	// ── Keyboard Shortcuts ─────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// DevTools: F12, Ctrl+Shift+I, Cmd+Option+I
			const isDevTools = 
				e.key === 'F12' || 
				((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') ||
				((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'i');

			if (isDevTools) {
				e.preventDefault();
				const rpc = useDownloadStore.getState().initializeRPC; // just to make sure
				const actualRpc = (window as any).__electrobun?.rpc;
				if (actualRpc) {
					actualRpc.request.toggleDevTools({});
				}
				return;
			}

			// New: Global Paste Shortcut (Ctrl+V / Cmd+V)
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
				// Only trigger if they aren't actively typing in the search bar or settings
				if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
				
				navigator.clipboard.readText().then((text) => {
					if (text && /^https?:\/\//.test(text.trim())) {
						setClipboardUrl(text.trim());
						setAddOpen(true);
					}
				}).catch(() => {});
			}

			if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
				if (e.key === 'n') {
					e.preventDefault();
					setAddOpen(true);
				} else if (e.key === 'p') {
					e.preventDefault();
					const anyActive = downloads.some((d) => d.status === "downloading");
					if (anyActive) pauseAll();
					else resumeAll();
				}
			}
		};

		const handleContextMenu = (e: MouseEvent) => {
			// On Linux, standard context menu is often blocked.
			// We can eventually implement a custom one here.
			// For now, we just ensure it doesn't crash or behave weirdly.
			// e.preventDefault(); 
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("contextmenu", handleContextMenu);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("contextmenu", handleContextMenu);
		};
	}, [downloads, pauseAll, resumeAll]);

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

	const filteredIds = useMemo(() => {
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
		return sorted.map(d => d.id);
	}, [downloads, filter, subTab, search, sortBy]);

	const selected = downloads.find((d) => d.id === selectedId) ?? null;
	const anyActive = counts.active > 0;

	// ── Render ─────────────────────────────────────────────────────
	return (
		<div className="flex h-screen w-full overflow-hidden">
			<Sidebar
				onOpenSettings={() => setSettingsOpen(true)}
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
						onClick={anyActive ? pauseAll : resumeAll}
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
					{filteredIds.length === 0 ? (
						<div className="h-full flex flex-col items-center justify-center text-center px-6">
							<div className="text-[15px] font-medium">No downloads yet</div>
							<p className="text-[12px] text-muted-foreground-2 mt-1 max-w-sm">
								Click <strong>Add URL</strong> to start your first download.
							</p>
						</div>
					) : (
						filteredIds.map((id) => (
							<DownloadRow
								key={id}
								id={id}
							/>
						))
					)}
				</div>
			</main>

			<DetailPanel />

			<AddUrlModal 
				open={addOpen} 
				onOpenChange={setAddOpen} 
				onAdd={addDownload} 
				initialUrl={clipboardUrl}
				onClearInitialUrl={() => setClipboardUrl("")}
			/>
			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
