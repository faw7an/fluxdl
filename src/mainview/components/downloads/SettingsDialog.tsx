import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Toaster, toast } from "sonner";
import { useDownloadStore } from "@/store/downloads";
import { getRPC } from "@/lib/rpc-helper";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
	const [maxConcurrent, setMaxConcurrent] = useState("3");
	const [osNotifs, setOsNotifs] = useState(true);
	const [checksums, setChecksums] = useState(false);
	const [catDirs, setCatDirs] = useState("");

    const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (open) {
			const rpc = getRPC();
			if (!rpc) {
				setLoading(false);
				return;
			}
			setLoading(true);
			rpc.request.getSettings({}).then((settings: Record<string, string>) => {
				if (settings["max_concurrent_downloads"]) setMaxConcurrent(settings["max_concurrent_downloads"]);
				if (settings["os_notifications"]) setOsNotifs(settings["os_notifications"] === "true");
				if (settings["verify_checksums"]) setChecksums(settings["verify_checksums"] === "true");
				if (settings["category_dirs"]) setCatDirs(settings["category_dirs"]);
				setLoading(false);
			}).catch(() => setLoading(false));
		}
	}, [open]);

	const handleSave = async () => {
		const rpc = getRPC();
		if (!rpc) return;

		try {
			// Validate JSON for categories
			if (catDirs.trim() !== "") {
				JSON.parse(catDirs);
			}

			await rpc.request.updateSetting({ key: "max_concurrent_downloads", value: maxConcurrent });
			await rpc.request.updateSetting({ key: "os_notifications", value: osNotifs ? "true" : "false" });
			await rpc.request.updateSetting({ key: "verify_checksums", value: checksums ? "true" : "false" });
			await rpc.request.updateSetting({ key: "category_dirs", value: catDirs || "{}" });

			toast.success("Settings saved");
			onOpenChange(false);
		} catch (error) {
			toast.error("Invalid JSON format for Category Directories.");
		}
	};

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
			toast.success("Logs exported successfully.");
		} catch (error) {
			toast.error("Failed to export logs.");
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px] bg-surface-1 border border-border text-foreground">
				<DialogHeader>
					<DialogTitle>Preferences</DialogTitle>
					<DialogDescription className="text-muted-foreground-2">Manage download behaviours and saving categories.</DialogDescription>
				</DialogHeader>

				{!loading && (
					<div className="grid gap-5 py-4">
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="maxConcurrent" className="text-right text-[13px] font-medium">
								Connections
							</Label>
							<Input
								id="maxConcurrent"
								type="number"
								min="1"
								max="10"
								value={maxConcurrent}
								onChange={(e) => setMaxConcurrent(e.target.value)}
								className="col-span-3 bg-surface-2 border-border focus-visible:ring-primary h-8"
							/>
						</div>

                        <div className="grid grid-cols-4 items-start gap-4">
							<Label htmlFor="catDirs" className="text-right text-[13px] font-medium pt-2">
								Directories
							</Label>
                            <div className="col-span-3">
                                <Input
                                    id="catDirs"
                                    placeholder='{"Video": "Videos", "Audio": "Music"}'
                                    value={catDirs}
                                    onChange={(e) => setCatDirs(e.target.value)}
                                    className="bg-surface-2 border-border focus-visible:ring-primary h-8 font-mono text-[11px]"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1.5">JSON map of category overrides to save directories</p>
                            </div>
						</div>

						<div className="flex items-center justify-between border-t border-border pt-4 mt-2">
							<div className="flex flex-col gap-1">
								<Label htmlFor="notifications" className="text-[13px] font-medium">Desktop Notifications</Label>
								<span className="text-[11px] text-muted-foreground-2">Show system alerts upon completion</span>
							</div>
							<Switch id="notifications" checked={osNotifs} onCheckedChange={setOsNotifs} />
						</div>

						<div className="flex items-center justify-between border-t border-border pt-4">
							<div className="flex flex-col gap-1">
								<Label htmlFor="checksums" className="text-[13px] font-medium">Verify Checksums</Label>
								<span className="text-[11px] text-muted-foreground-2">Compute SHA256 post-hash upon completion</span>
							</div>
							<Switch id="checksums" checked={checksums} onCheckedChange={setChecksums} />
						</div>
					</div>
				)}

				<DialogFooter className="flex justify-between items-center sm:justify-between w-full">
					<Button type="button" variant="outline" onClick={exportLogs} className="h-8 text-[12px] bg-surface-2 border-border hover:bg-surface-3">
						Export Diagnostics
					</Button>
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-8 text-[12px] bg-surface-2 border-border hover:bg-surface-3 hover:text-foreground">
							Cancel
						</Button>
						<Button type="submit" onClick={handleSave} className="h-8 text-[12px] bg-primary text-primary-foreground hover:bg-primary-strong">
							Save changes
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
