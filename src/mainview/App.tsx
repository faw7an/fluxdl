import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Plus, Search, Trash2, Settings, DownloadCloud, RotateCw } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Sidebar } from "@/components/downloads/Sidebar";
import { DownloadRow } from "@/components/downloads/DownloadRow";
import { DetailPanel } from "@/components/downloads/DetailPanel";
import { SettingsView } from "@/components/downloads/SettingsView";
import { AddUrlModal } from "@/components/downloads/AddUrlDialog";
import { formatBytes } from "@/lib/downloads-data";
import { cn } from "@/lib/utils";
import { useDownloadStore } from "@/store/downloads";
import { useClipboardCapture } from "@/hooks/use-clipboard";
import { getRPC } from "@/lib/rpc-helper";

// ── Constants ─────────────────────────────────────────────────────────────────
const SUB_TABS = ["all", "downloading", "paused", "queued", "done"] as const;
type SubTab = (typeof SUB_TABS)[number];

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
	const {
		downloadIds,
		downloadsById,
		counts,
		totalDownBps,
		totalSize,
		filter,
		search,
		setSearch,
		sortBy,
		setSortBy,
		initializeRPC,
		fetchDownloads,
		addDownload,
		pauseAll,
		resumeAll,
		clearCompleted,
	} = useDownloadStore();

	const [subTab, setSubTab] = useState<SubTab>("all");
	const [addOpen, setAddOpen] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [clipboardUrl, setClipboardUrl] = useState("");
	const [isDragging, setIsDragging] = useState(false);
	const listRef = useRef<HTMLDivElement | null>(null);

	// ── OS Wake Lock trigger ────────────────────────────────────────────────
	useEffect(() => {
		const activeCount = downloadIds.reduce((count, id) => {
			const download = downloadsById[id];
			return count + (download?.status === "downloading" ? 1 : 0);
		}, 0);
		const rpc = getRPC();
		if (rpc) {
			rpc.request.setWakeLock({ active: activeCount > 0 });
		}
	}, [downloadIds, downloadsById]);

	// ── Drag and Drop Logic ─────────────────────────────────────────────────
	useEffect(() => {
		const handleDragOver = (e: DragEvent) => {
			e.preventDefault();
			setIsDragging(true);
		};

		const handleDragLeave = (e: DragEvent) => {
			e.preventDefault();
			if (e.relatedTarget === null || (e.relatedTarget as HTMLElement).nodeName === "HTML") {
				setIsDragging(false);
			}
		};

		const handleDrop = async (e: DragEvent) => {
			e.preventDefault();
			setIsDragging(false);

			const dt = e.dataTransfer;
			if (!dt) return;

			if (dt.files && dt.files.length > 0) {
				const file = dt.files[0];
				if (file.name.endsWith(".txt")) {
					try {
						const text = await file.text();
						const urls = text.split("\n")
							.map(l => l.trim())
							.filter(l => /^https?:\/\//.test(l));

						if (urls.length > 0) {
							urls.forEach(u => addDownload({ url: u, category: "Software", segments: 8 }));
							toast.success(`Bulk imported ${urls.length} links!`);
						} else {
							toast.error("No valid HTTP/HTTPS URLs found in file.");
						}
					} catch (err) {
						toast.error("Failed to parse the dropped file.");
					}
				} else {
					toast.error("Only .txt files are supported for bulk imports.");
				}
				return;
			}

			const textData = dt.getData("text/plain");
			if (textData && /^https?:\/\//.test(textData.trim())) {
				setClipboardUrl(textData.trim());
				setAddOpen(true);
			}
		};

		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);

		return () => {
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
		};
	}, [addDownload]);

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

	// ── Network Auto-Recovery ──────────────────────────────────────────────────
	useEffect(() => {
		const handleOnline = () => {
			const { downloadIds: ids, downloadsById: byId } = useDownloadStore.getState();
			const erroredCount = ids.reduce((count, id) => {
				const download = byId[id];
				return count + (download?.status === "error" ? 1 : 0);
			}, 0);
			if (erroredCount > 0) {
				toast.success("Network restored! Auto-resuming failed downloads.");
				useDownloadStore.getState().resumeErrored();
			} else {
				toast.info("Network connection restored.");
			}
		};

		const handleOffline = () => {
			toast.warning("Network connection lost. Downloads will pause or fail.", { duration: 5000 });
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
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
				
				const rpc = getRPC();
				if (!rpc) return;
				rpc.request.readClipboard({}).then((text: string | null) => {
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
					const anyActive = downloadIds.some((id) => downloadsById[id]?.status === "downloading");
					if (anyActive) pauseAll();
					else resumeAll();
				}
			}
		};

			const handleContextMenu = (_e: MouseEvent) => {
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
	}, [downloadIds, downloadsById, pauseAll, resumeAll]);

	// ── Derived state ──────────────────────────────────────────────
	const hasErrors = counts.error > 0;

	const filteredIds = useMemo(() => {
		let list = downloadIds
			.map((id) => downloadsById[id])
			.filter((download): download is NonNullable<typeof download> => Boolean(download));
		if (filter === "active") list = list.filter((d) => d.status === "downloading");
		else if (filter === "queued") list = list.filter((d) => d.status === "queued");
		else if (filter === "done") list = list.filter((d) => d.status === "done");
		else if (filter === "error") list = list.filter((d) => d.status === "error");
		if (subTab !== "all") list = list.filter((d) => d.status === subTab);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter((d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q));
		}
		if (sortBy === "newest") return list.map((d) => d.id);
		if (sortBy === "oldest") return [...list].reverse().map((d) => d.id);
		const sorted = [...list];
		if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
		if (sortBy === "size") sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
		if (sortBy === "progress") {
			sorted.sort((a, b) => b.downloadedBytes / (b.sizeBytes || 1) - a.downloadedBytes / (a.sizeBytes || 1));
		}
		return sorted.map((d) => d.id);
	}, [downloadIds, downloadsById, filter, subTab, search, sortBy]);

	const anyActive = counts.active > 0;
	const shouldVirtualize = filteredIds.length > 80;
	const rowVirtualizer = useVirtualizer({
		count: filteredIds.length,
		getScrollElement: () => listRef.current,
		estimateSize: () => 120,
		overscan: 8,
	});

	// ── Render ─────────────────────────────────────────────────────
	return (
			<div className="flex h-screen w-full overflow-hidden flex-col md:flex-row">
				<div className="hidden md:flex">
					<Sidebar
					onOpenSettings={() => setShowSettings(true)}
					settingsActive={showSettings}
					/>
				</div>

				<main className="flex-1 flex flex-col overflow-hidden">
				{/* Topbar */}
				<header className="flex items-center gap-3 px-4 md:px-5 py-3.5 border-b border-border bg-surface-1 flex-wrap">
					<div className="flex-1 min-w-[180px]">
						<h1 className="text-[15px] font-semibold tracking-tight">{showSettings ? "Settings" : "Downloads"}</h1>
						<p className="text-[12px] text-muted-foreground-2 mt-0.5">
							{showSettings
								? "Tune your download engine, notifications, and appearance"
								: `${counts.active} active · ${formatBytes(totalSize, 1)} total`
							}
						</p>
					</div>

				{!showSettings && (
					<div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
						<div className="relative w-full sm:w-[220px]">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground-2" />
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search downloads..."
									className="bg-surface-2 border border-border rounded-md pl-8 pr-3 py-1.5 text-[12px] w-full outline-none focus:border-primary focus:bg-surface-3 transition-colors placeholder:text-muted-foreground-2"
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
								onClick={() => setShowSettings(true)}
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
						</div>
					)}

					{showSettings && (
						<button
							onClick={() => setShowSettings(false)}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-surface-2 border border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors"
						>
							Back to downloads
						</button>
					)}
				</header>

				{/* Stats strip */}
				{!showSettings && (
					<div className="hidden md:flex border-b border-border bg-surface-1 px-5">
						<Stat tone="success" pulse num={counts.active} label="Active" />
						<Stat tone="warning" num={counts.paused} label="Paused" />
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
				)}

				{/* Filter tabs */}
				{!showSettings && (
					<div className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur border-b border-border">
						{hasErrors && (
							<div className="mx-4 md:mx-5 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
								<div>
									<div className="text-[12px] font-medium text-destructive">{counts.error} failed downloads</div>
									<div className="text-[11px] text-muted-foreground-2">Retry all failed transfers in one action.</div>
								</div>
								<button
									onClick={() => useDownloadStore.getState().resumeErrored()}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
								>
									<RotateCw className="w-3.5 h-3.5" />
									Retry all
								</button>
							</div>
						)}
						<div className="flex items-center gap-2 px-4 md:px-5 py-3 flex-wrap">
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
								className="bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground outline-none cursor-pointer hover:text-foreground w-full sm:w-auto"
							>
								<option value="newest">Newest first</option>
								<option value="oldest">Oldest first</option>
								<option value="name">Name A–Z</option>
								<option value="size">Size desc.</option>
								<option value="progress">Progress</option>
							</select>
						</div>
					</div>
				)}

				{/* List */}
				{showSettings ? (
					<SettingsView onClose={() => setShowSettings(false)} />
				) : (
					<div ref={listRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-2">
						{filteredIds.length === 0 ? (
							<div className="h-full flex flex-col items-center justify-center text-center px-4 md:px-6">
								<div className="relative">
									<div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%)]" />
									<div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-surface-2 border border-border flex items-center justify-center shadow-lg">
										<DownloadCloud className="w-10 h-10 text-primary" />
									</div>
								</div>
								<div className="text-[15px] font-medium mt-5">Start your first download</div>
								<p className="text-[12px] text-muted-foreground-2 mt-1 max-w-sm">
									Paste a URL, drag a .txt list, or hit the shortcut to begin.
								</p>
								<div className="mt-5 flex flex-wrap items-center justify-center gap-3">
									<KeyCap>Ctrl</KeyCap>
									<KeyCap>V</KeyCap>
									<span className="text-[11px] text-muted-foreground-2">Paste URL</span>
									<span className="mx-1 text-muted-foreground-2">•</span>
									<KeyCap>Ctrl</KeyCap>
									<KeyCap>N</KeyCap>
									<span className="text-[11px] text-muted-foreground-2">New download</span>
								</div>
								<div className="mt-6 grid gap-3 text-[11px] text-muted-foreground-2">
									<div className="flex items-center justify-center gap-2">
										<div className="w-10 h-10 rounded-full border border-border bg-surface-2 flex items-center justify-center">URL</div>
										<div className="w-10 h-10 rounded-full border border-border bg-surface-2 flex items-center justify-center">TXT</div>
										<div className="w-10 h-10 rounded-full border border-border bg-surface-2 flex items-center justify-center">DRAG</div>
									</div>
									<div>Drag and drop URLs or .txt lists anywhere in the window.</div>
								</div>
							</div>
						) : shouldVirtualize ? (
							<div
								style={{
									height: rowVirtualizer.getTotalSize(),
									position: "relative",
								}}
							>
								{rowVirtualizer.getVirtualItems().map((virtualRow) => {
									const id = filteredIds[virtualRow.index];
									return (
										<div
											key={id}
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												transform: `translateY(${virtualRow.start}px)`,
											}}
										>
											<DownloadRow id={id} />
										</div>
									);
								})}
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
				)}
			</main>

			{!showSettings && <DetailPanel />}

			{isDragging && (
				<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
					<div className="w-full h-full border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center bg-primary/5 text-primary pointer-events-none">
						<div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 pulse-dot">
							<DownloadCloud className="w-10 h-10" />
						</div>
						<h2 className="text-2xl font-bold tracking-tight">Drop files or links here</h2>
						<p className="text-muted-foreground-2 mt-2">
							Drop a <strong>.txt</strong> file to bulk-import, or drop a URL to add it to the queue.
						</p>
					</div>
				</div>
			)}

			<AddUrlModal 
				open={addOpen} 
				onOpenChange={setAddOpen} 
				onAdd={addDownload} 
				initialUrl={clipboardUrl}
				onClearInitialUrl={() => setClipboardUrl("")}
			/>
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

function KeyCap({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-medium text-foreground">
			{children}
		</span>
	);
}

export default App;
