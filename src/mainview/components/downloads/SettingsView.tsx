import { useEffect, useMemo, useRef, useState, type DependencyList } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRPC } from "@/lib/rpc-helper";

const DEFAULT_CATEGORIES = ["Video", "Audio", "Software", "Documents", "Archives"] as const;

type CategoryRow = {
	id: string;
	name: string;
	dir: string;
	locked?: boolean;
};

type Props = {
	onClose: () => void;
};

const SPEED_MAX = 100000;

export function SettingsView({ onClose }: Props) {
	const [loading, setLoading] = useState(true);
	const [hydrated, setHydrated] = useState(false);

	const [defaultDir, setDefaultDir] = useState("");
	const [launchOnStartup, setLaunchOnStartup] = useState(false);
	const [minimizeToTray, setMinimizeToTray] = useState(true);
	const [maxConcurrent, setMaxConcurrent] = useState("3");
	const [speedLimit, setSpeedLimit] = useState("0");
	const [maxSegments, setMaxSegments] = useState("8");
	const [theme, setTheme] = useState("system");
	const [density, setDensity] = useState("comfortable");
	const [osNotifs, setOsNotifs] = useState(true);
	const [notifyError, setNotifyError] = useState(true);
	const [soundOnComplete, setSoundOnComplete] = useState(false);
	const [verifyChecksums, setVerifyChecksums] = useState(false);
	const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);

	const speedValue = useMemo(() => {
		const parsed = Number(speedLimit);
		return Number.isFinite(parsed) ? Math.max(0, Math.min(SPEED_MAX, parsed)) : 0;
	}, [speedLimit]);

	const savedTimers = useRef<Record<string, number>>({});
	const speedLimitSource = useRef<"text" | "slider" | null>(null);
	const lastCategoryEditId = useRef<string | null>(null);

	const showSaved = (key: string) => {
		setSaved((prev) => ({ ...prev, [key]: true }));
		if (savedTimers.current[key]) {
			window.clearTimeout(savedTimers.current[key]);
		}
		savedTimers.current[key] = window.setTimeout(() => {
			setSaved((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		}, 1500);
	};

	const updateSetting = async (key: string, value: string, savedKey?: string) => {
		const rpc = getRPC();
		if (!rpc) return;
		try {
			await rpc.request.updateSetting({ key, value });
			if (savedKey) showSaved(savedKey);
		} catch (err) {
			toast.error("Failed to save settings");
		}
	};

	const [saved, setSaved] = useState<Record<string, boolean>>({});
	const skipInitial = useRef({
		defaultDir: true,
		maxConcurrent: true,
		speedLimit: true,
		categories: true,
	});

	useEffect(() => {
		const loadSettings = async () => {
			const rpc = getRPC();
			if (!rpc) {
				setLoading(false);
				return;
			}
			try {
				const settings = await rpc.request.getSettings({});
				setDefaultDir(settings["default_download_dir"] ?? "");
				setLaunchOnStartup(parseBool(settings["launch_on_startup"], false));
				setMinimizeToTray(parseBool(settings["minimize_to_tray"], true));
				setMaxConcurrent(settings["max_concurrent_downloads"] ?? "3");
				setSpeedLimit(settings["global_speed_limit_kbps"] ?? "0");
				setMaxSegments(settings["max_segments_per_download"] ?? "8");
				setTheme(settings["ui_theme"] ?? "system");
				setDensity(settings["ui_density"] ?? "comfortable");
				setOsNotifs(parseBool(settings["os_notifications"], true));
				setNotifyError(parseBool(settings["notify_on_error"], true));
				setSoundOnComplete(parseBool(settings["play_sound_on_complete"], false));
				setVerifyChecksums(parseBool(settings["verify_checksums"], false));

				const parsedCategories = safeParseCategories(settings["category_dirs"] ?? "{}");
				setCategoryRows(buildCategoryRows(parsedCategories));
			} catch (err) {
				toast.error("Failed to load settings");
			} finally {
				setLoading(false);
				setHydrated(true);
			}
		};

		loadSettings();
	}, []);

	useDebouncedEffect(
		() => {
			if (!hydrated) return;
			if (skipInitial.current.defaultDir) {
				skipInitial.current.defaultDir = false;
				return;
			}
			updateSetting("default_download_dir", defaultDir.trim(), "defaultDir");
		},
		[defaultDir, hydrated],
		500,
	);

	useDebouncedEffect(
		() => {
			if (!hydrated) return;
			if (skipInitial.current.maxConcurrent) {
				skipInitial.current.maxConcurrent = false;
				return;
			}
			updateSetting("max_concurrent_downloads", sanitizeNumber(maxConcurrent, 1, 16), "maxConcurrent");
		},
		[maxConcurrent, hydrated],
		500,
	);

	useDebouncedEffect(
		() => {
			if (!hydrated) return;
			if (skipInitial.current.speedLimit) {
				skipInitial.current.speedLimit = false;
				return;
			}
			if (speedLimitSource.current === "slider") {
				speedLimitSource.current = null;
				return;
			}
			updateSetting("global_speed_limit_kbps", sanitizeNumber(speedLimit, 0, SPEED_MAX), "speedLimit");
		},
		[speedLimit, hydrated],
		500,
	);

	useDebouncedEffect(
		() => {
			if (!hydrated) return;
			if (skipInitial.current.categories) {
				skipInitial.current.categories = false;
				return;
			}
			const categoryMap = buildCategoryMap(categoryRows);
			updateSetting("category_dirs", JSON.stringify(categoryMap), "categories");
		},
		[categoryRows, hydrated],
		600,
	);

	const exportLogs = async () => {
		const rpc = getRPC();
		if (!rpc) return;
		try {
			const logs = await rpc.request.exportLogs({});
			const blob = new Blob([logs], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "fluxdl-diagnostics.log";
			a.click();
			URL.revokeObjectURL(url);
			toast.success("Logs exported successfully");
		} catch (error) {
			toast.error("Failed to export logs");
		}
	};

	const updateCategory = (id: string, patch: Partial<CategoryRow>) => {
		lastCategoryEditId.current = id;
		setCategoryRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
	};

	const removeCategory = (id: string) => {
		setCategoryRows((rows) => rows.filter((row) => row.id !== id));
	};

	const addCategory = () => {
		setCategoryRows((rows) => [
			...rows,
			{ id: createId(), name: "", dir: "", locked: false },
		]);
	};

	return (
		<div className="flex-1 overflow-hidden">
			<ScrollArea className="h-full">
					<div className="px-4 md:px-6 py-6">
					<Tabs defaultValue="general">
						<TabsList className="w-full justify-start bg-surface-2/70 border border-border rounded-xl p-1 flex-wrap gap-1">
							<TabsTrigger value="general" className="text-[12px]">General</TabsTrigger>
							<TabsTrigger value="network" className="text-[12px]">Network</TabsTrigger>
							<TabsTrigger value="categories" className="text-[12px]">Categories</TabsTrigger>
							<TabsTrigger value="appearance" className="text-[12px]">Appearance</TabsTrigger>
							<TabsTrigger value="notifications" className="text-[12px]">Notifications</TabsTrigger>
							<TabsTrigger value="about" className="text-[12px]">About</TabsTrigger>
						</TabsList>

						{loading ? (
							<div className="mt-8 text-sm text-muted-foreground-2">Loading settings...</div>
						) : (
							<>
								<TabsContent value="general" className="mt-6">
									<Section title="Startup & Behavior" description="Set how FluxDL behaves when the desktop session begins.">
										<ToggleRow
											label="Launch on system startup"
											value={launchOnStartup}
											onChange={(next) => {
												setLaunchOnStartup(next);
												updateSetting("launch_on_startup", next ? "true" : "false");
											}}
											description="Automatically open FluxDL when you log in."
										/>
										<ToggleRow
											label="Minimize to tray instead of quitting"
											value={minimizeToTray}
											onChange={(next) => {
												setMinimizeToTray(next);
												updateSetting("minimize_to_tray", next ? "true" : "false");
											}}
											description="Keep downloads alive when the window is closed."
										/>
									</Section>

									<Section title="Default Save Location" description="Base folder used for every category.">
										<div className="space-y-2">
											<div className="flex flex-wrap items-center gap-2">
												<Label className="text-[11px] uppercase tracking-wider text-muted-foreground-2">Download folder</Label>
												<SavedChip show={saved.defaultDir} />
											</div>
											<Input
												value={defaultDir}
												onChange={(e) => setDefaultDir(e.target.value)}
												placeholder="/home/you/Downloads"
												className="bg-surface-2 border-border"
											/>
											<p className="text-[11px] text-muted-foreground-2">
												Leave blank to use the system home folder.
											</p>
										</div>
									</Section>
								</TabsContent>

								<TabsContent value="network" className="mt-6">
									<Section title="Bandwidth Control" description="Throttle total throughput across all active downloads.">
										<div className="grid gap-4">
											<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
												<div>
													<div className="text-[13px] font-medium">Global speed limit</div>
													<div className="text-[11px] text-muted-foreground-2">Set to 0 for unlimited.</div>
												</div>
												<div className="flex flex-wrap items-center gap-2">
													<Input
														type="number"
														min="0"
														max={SPEED_MAX}
														value={speedLimit}
														onChange={(e) => {
														speedLimitSource.current = "text";
														setSpeedLimit(e.target.value);
													}}
													className="w-24 sm:w-28 bg-surface-2 border-border"
												/>
													<span className="text-[11px] text-muted-foreground-2">KB/s</span>
													<SavedChip show={saved.speedLimit} />
												</div>
											</div>
											<div className="pt-2">
												<Slider
													value={[speedValue]}
													min={0}
													max={SPEED_MAX}
													step={100}
													onValueChange={(value: number[]) => {
														const next = String(value[0] ?? 0);
														speedLimitSource.current = "slider";
														setSpeedLimit(next);
														updateSetting("global_speed_limit_kbps", sanitizeNumber(next, 0, SPEED_MAX), "speedLimit");
													}}
												/>
											</div>
										</div>
									</Section>

									<Section title="Concurrency" description="Control how many downloads run at the same time.">
										<div className="grid gap-4">
											<div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-4">
												<div>
													<div className="flex flex-wrap items-center gap-2">
														<div className="text-[13px] font-medium">Max concurrent downloads</div>
														<Badge>Requires restart</Badge>
													</div>
													<div className="text-[11px] text-muted-foreground-2">Controls the engine queue.</div>
												</div>
												<Input
													type="number"
													min="1"
													max="16"
													value={maxConcurrent}
													onChange={(e) => setMaxConcurrent(e.target.value)}
													className="w-24 bg-surface-2 border-border"
												/>
												<SavedChip show={saved.maxConcurrent} />
											</div>
											<div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-4">
												<div>
													<div className="flex flex-wrap items-center gap-2">
														<div className="text-[13px] font-medium">Default segments per download</div>
														<Badge>Requires restart</Badge>
													</div>
													<div className="text-[11px] text-muted-foreground-2">Used when servers support range requests.</div>
												</div>
												<Select
													value={maxSegments}
													onValueChange={(next) => {
														setMaxSegments(next);
														updateSetting("max_segments_per_download", sanitizeNumber(next, 1, 32));
													}}
												>
													<SelectTrigger className="w-24 sm:w-28 bg-surface-2 border-border">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{[1, 2, 4, 8, 16, 32].map((n) => (
															<SelectItem key={n} value={String(n)}>
																{n} segments
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
									</Section>
								</TabsContent>

								<TabsContent value="categories" className="mt-6">
									<Section title="Category Folders" description="Route categories into custom sub-folders.">
										<div className="space-y-3">
											<div className="hidden md:grid grid-cols-[1fr_1fr_auto] gap-3 text-[11px] uppercase tracking-wider text-muted-foreground-2">
												<div>Category</div>
												<div>Folder</div>
												<div />
											</div>
												{categoryRows.map((row) => (
													<div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 md:items-center">
															{row.locked ? (
																<div className="text-[13px] font-medium text-foreground">
																	{row.name}
																</div>
															) : (
																<Input
																	value={row.name}
																	onChange={(e) => updateCategory(row.id, { name: e.target.value })}
																	placeholder="Custom"
																	className="bg-surface-2 border-border"
																/>
															)}
													<Input
														value={row.dir}
														onChange={(e) => updateCategory(row.id, { dir: e.target.value })}
														placeholder="Videos/FluxDL"
														className="bg-surface-2 border-border"
													/>
														<div className="flex items-center gap-2 justify-start md:justify-end">
																	{saved.categories && lastCategoryEditId.current === row.id && (
																		<SavedChip show />
																	)}
																	{row.locked ? (
																		<div className="text-[10px] text-muted-foreground-2">Default</div>
																	) : (
																		<Button
																		variant="ghost"
																		onClick={() => removeCategory(row.id)}
																		className="text-[11px] text-muted-foreground hover:text-foreground"
																	>
																		Remove
																	</Button>
																)}
																</div>
														</div>
													))}
											<Button
												variant="outline"
												onClick={addCategory}
												className="mt-2 w-fit bg-surface-2 border-border text-[12px]"
											>
												Add custom category
											</Button>
											<p className="text-[11px] text-muted-foreground-2">
												Leave folder blank to use the default system location.
											</p>
										</div>
									</Section>
								</TabsContent>

								<TabsContent value="appearance" className="mt-6">
										<Section title="Theme" description="Choose the UI appearance.">
									<div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-4">
												<div>
													<div className="flex items-center gap-2">
														<div className="text-[13px] font-medium">Theme</div>
														<Badge>Requires restart</Badge>
													</div>
													<div className="text-[11px] text-muted-foreground-2">Requires restart to fully apply.</div>
												</div>
											<Select
												value={theme}
												onValueChange={(next) => {
													setTheme(next);
													updateSetting("ui_theme", next);
												}}
											>
												<SelectTrigger className="w-28 sm:w-32 bg-surface-2 border-border">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="system">System</SelectItem>
													<SelectItem value="dark">Dark</SelectItem>
													<SelectItem value="light">Light</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</Section>

									<Section title="Density" description="Adjust spacing for compact or roomy layouts.">
									<div className="grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-4">
											<div>
												<div className="text-[13px] font-medium">Interface density</div>
												<div className="text-[11px] text-muted-foreground-2">Affects lists and cards.</div>
											</div>
											<Select
												value={density}
												onValueChange={(next) => {
													setDensity(next);
													updateSetting("ui_density", next);
												}}
											>
												<SelectTrigger className="w-28 sm:w-36 bg-surface-2 border-border">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="compact">Compact</SelectItem>
													<SelectItem value="comfortable">Comfortable</SelectItem>
													<SelectItem value="spacious">Spacious</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</Section>
								</TabsContent>

								<TabsContent value="notifications" className="mt-6">
									<Section title="Desktop Alerts" description="Stay informed when transfers finish.">
									<ToggleRow
										label="Show desktop notifications"
										value={osNotifs}
										onChange={(next) => {
											setOsNotifs(next);
											updateSetting("os_notifications", next ? "true" : "false");
										}}
										description="Triggers native notifications on completion."
									/>
									<ToggleRow
										label="Notify on error"
										value={notifyError}
										onChange={(next) => {
											setNotifyError(next);
											updateSetting("notify_on_error", next ? "true" : "false");
										}}
										description="Send an alert when a download fails."
									/>
									<ToggleRow
										label="Play sound on completion"
										value={soundOnComplete}
										onChange={(next) => {
											setSoundOnComplete(next);
											updateSetting("play_sound_on_complete", next ? "true" : "false");
										}}
										description="Adds a subtle sound when a transfer finishes."
									/>
									</Section>

									<Section title="Integrity" description="Verification tools after completion.">
									<ToggleRow
										label="Verify SHA256 checksums"
										value={verifyChecksums}
										onChange={(next) => {
											setVerifyChecksums(next);
											updateSetting("verify_checksums", next ? "true" : "false");
										}}
										description="Compute hashes to confirm file integrity."
									/>
									</Section>
								</TabsContent>

								<TabsContent value="about" className="mt-6">
									<div className="grid gap-4">
										<div className="rounded-xl border border-border bg-surface-1/70 p-5">
											<div className="text-[14px] font-semibold">FluxDL</div>
											<div className="text-[11px] text-muted-foreground-2 mt-1">Version 1.0.13 · Electrobun 1.16</div>
											<Separator className="my-4" />
											<div className="grid gap-2 text-[12px] text-muted-foreground">
												<div>License: MIT</div>
												<div>Desktop download manager with multi-segment streaming.</div>
											</div>
										</div>
										<div className="rounded-xl border border-border bg-surface-1/70 p-5">
											<div className="text-[13px] font-medium">Diagnostics</div>
											<div className="text-[11px] text-muted-foreground-2 mt-1">Export logs for debugging and support.</div>
											<Button
												onClick={exportLogs}
												variant="outline"
												className="mt-3 bg-surface-2 border-border text-[12px]"
											>
												Export diagnostics
											</Button>
										</div>
									</div>
								</TabsContent>
							</>
						)}
					</Tabs>
				</div>
			</ScrollArea>
			<div className="border-t border-border bg-surface-1/80 px-4 md:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
				<div className="text-[11px] text-muted-foreground-2">Changes save automatically.</div>
				<Button variant="outline" onClick={onClose} className="bg-surface-2 border-border text-[12px]">
					Back
				</Button>
			</div>
		</div>
	);
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border bg-surface-1/70 p-5 mb-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="text-[14px] font-semibold">{title}</div>
					<div className="text-[11px] text-muted-foreground-2 mt-1">{description}</div>
				</div>
			</div>
			<div className="mt-4 space-y-4">{children}</div>
		</div>
	);
}

function ToggleRow({
	label,
	value,
	onChange,
	description,
}: {
	label: string;
	value: boolean;
	onChange: (next: boolean) => void;
	description: string;
}) {
	return (
		<div className="flex items-center justify-between gap-6">
			<div>
				<div className="text-[13px] font-medium">{label}</div>
				<div className="text-[11px] text-muted-foreground-2 mt-1">{description}</div>
			</div>
			<Switch checked={value} onCheckedChange={onChange} />
		</div>
	);
}

function Badge({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warning">
			{children}
		</span>
	);
}

function SavedChip({ show }: { show?: boolean }) {
	if (!show) return null;
	return (
		<span className="text-[10px] text-success font-medium">Saved ✓</span>
	);
}

function useDebouncedEffect(effect: () => void, deps: DependencyList, delay: number) {
	useEffect(() => {
		const timer = window.setTimeout(() => effect(), delay);
		return () => window.clearTimeout(timer);
	}, deps);
}

function parseBool(value: string | undefined, fallback: boolean) {
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

function safeParseCategories(raw: string): Record<string, string> {
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
	} catch {
		toast.error("Category mapping was invalid and has been reset");
	}
	return {};
}

function buildCategoryRows(map: Record<string, string>): CategoryRow[] {
	const rows: CategoryRow[] = DEFAULT_CATEGORIES.map((name) => ({
		id: createId(),
		name,
		dir: map[name] ?? "",
		locked: true,
	}));
	const extraKeys = Object.keys(map).filter((key) => !DEFAULT_CATEGORIES.includes(key as any));
	for (const key of extraKeys) {
		rows.push({ id: createId(), name: key, dir: map[key] ?? "", locked: false });
	}
	return rows;
}

function buildCategoryMap(rows: CategoryRow[]) {
	const map: Record<string, string> = {};
	for (const row of rows) {
		const name = row.name.trim();
		const dir = row.dir.trim();
		if (!name || !dir) continue;
		map[name] = dir;
	}
	return map;
}

function createId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeNumber(value: string, min: number, max: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return String(min);
	return String(Math.min(max, Math.max(min, Math.floor(parsed))));
}
