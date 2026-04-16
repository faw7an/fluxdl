import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getRPC } from "@/lib/rpc-helper";
import { formatBytes } from "@/lib/downloads-data";
import { uiLogger } from "@/lib/logger";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { url: string; category: string; segments: number }) => void;
}

export function AddUrlModal({ open, onOpenChange, onAdd }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Software");
  const [segments, setSegments] = useState("8");
  const [loading, setLoading] = useState(false);

  const [metadata, setMetadata] = useState<{ name: string; sizeBytes: number; acceptRanges: boolean; error?: string } | null>(null);

  const handleNext = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const rpc = getRPC();
      if (!rpc) throw new Error("Backend not connected");

      const info = await rpc.request.fetchUrlInfo({ url: url.trim() });
      if (info.error) {
        uiLogger.warn(`Pre-flight check returned error: ${info.error}`, "AddUrl");
      }
      setMetadata(info);
      
      // Auto-adjust segments if server doesn't support ranges
      if (!info.acceptRanges || info.sizeBytes === 0) {
        setSegments("1");
      }
      setStep(2);
    } catch (e) {
      uiLogger.error("Failed to fetch preflight info", "AddUrl", e as Error);
      // Proceed gracefully even if backend fetch fails
      setMetadata({ name: url.split("/").pop() || "download.bin", sizeBytes: 0, acceptRanges: false, error: "Failed to verify source" });
      setSegments("1");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    onAdd({ url: url.trim(), category, segments: parseInt(segments) });
    handleClose();
  };

  const handleClose = () => {
    setUrl("");
    setStep(1);
    setMetadata(null);
    onOpenChange(false);
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(v) => {
        if (!v) handleClose();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="bg-surface-1 border-input sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add new download</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground-2">
            {step === 1 ? "Paste a direct URL to fetch source metadata." : "Configure delivery constraints."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {step === 1 ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-semibold">
                Source URL
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNext()}
                placeholder="https://example.com/file.zip"
                className="font-mono text-[12px] bg-surface-2 border-border"
                autoFocus
                disabled={loading}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface-2 border border-border rounded-md p-3">
                <div className="text-[13px] font-medium text-foreground truncate break-all mb-1.5">
                  {metadata?.name}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={metadata?.sizeBytes ? "text-primary font-mono" : "text-muted-foreground"}>
                    {metadata?.sizeBytes ? formatBytes(metadata.sizeBytes, 2) : "Unknown size"}
                  </span>
                  {metadata?.error ? (
                    <span className="text-warning bg-warning/10 px-1.5 py-0.5 rounded font-medium">Head check failed</span>
                  ) : metadata?.acceptRanges ? (
                    <span className="text-success bg-success/10 px-1.5 py-0.5 rounded font-medium">Segmentable</span>
                  ) : (
                    <span className="text-muted-foreground-2 bg-surface-3 px-1.5 py-0.5 rounded font-medium">Single Thread</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-semibold">
                    Category
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-surface-2 border-border text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Video">Video</SelectItem>
                      <SelectItem value="Audio">Audio</SelectItem>
                      <SelectItem value="Software">Software</SelectItem>
                      <SelectItem value="Documents">Documents</SelectItem>
                      <SelectItem value="Archives">Archives</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-semibold">
                    Connections
                  </Label>
                  <Select value={segments} onValueChange={setSegments} disabled={metadata?.acceptRanges === false}>
                    <SelectTrigger className="bg-surface-2 border-border text-[12px] disabled:opacity-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 4, 8, 16].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} segments
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleNext}
                className="bg-primary text-primary-foreground hover:bg-primary-strong"
                disabled={loading || !url.trim()}
              >
                {loading ? "Analyzing..." : "Next →"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button
                onClick={submit}
                className="bg-primary text-primary-foreground hover:bg-primary-strong"
              >
                Start download
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
