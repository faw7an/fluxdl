import { useState, useEffect } from "react";
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
  onAdd: (data: { url: string; category: string; segments: number; headers?: Record<string, string> }) => void;
  initialUrl?: string;
  onClearInitialUrl?: () => void;
}

export function AddUrlModal({ open, onOpenChange, onAdd, initialUrl, onClearInitialUrl }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Software");
  const [segments, setSegments] = useState("8");
  const [loading, setLoading] = useState(false);

  const [metadata, setMetadata] = useState<{ name: string; sizeBytes: number; acceptRanges: boolean; headers?: Record<string, string>; error?: string } | null>(null);
  const [headerRaw, setHeaderRaw] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset state and handle auto-fetch when opened with a clipboard URL
  useEffect(() => {
    if (open) {
      setUrl(initialUrl || "");
      setStep(1);
      setMetadata(null);
      setHeaderRaw("");
      setShowAdvanced(false);

      if (initialUrl) {
        // Slight delay allows the modal animation to run smoothly before locking the thread for the RPC call
        setTimeout(() => handleNext(initialUrl), 300);
      }
    } else {
      if (onClearInitialUrl) onClearInitialUrl();
    }
  }, [open, initialUrl]);

  const parseHeaders = (raw: string): Record<string, string> | undefined => {
    if (!raw.trim()) return undefined;
    const lines = raw.split("\n");
    const headers: Record<string, string> = {};
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(":").trim();
        if (key && value) headers[key] = value;
      }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  };
  const handleNext = async (targetUrl?: string) => {
    const fetchUrl = typeof targetUrl === "string" ? targetUrl : url;
    if (!fetchUrl.trim()) return;
    setLoading(true);
    try {
      const rpc = getRPC();
      if (!rpc) throw new Error("Backend not connected");

      const customHeaders = parseHeaders(headerRaw);
      const info = await rpc.request.fetchUrlInfo({ url: fetchUrl.trim(), headers: customHeaders });
      if (info.error) {
        uiLogger.warn(`Pre-flight check returned error: ${info.error}`, "AddUrl");
      }
      setMetadata(info);
      
      // Auto-adjust segments if server doesn't support ranges
      if (!info.acceptRanges || info.sizeBytes === 0) {
        setSegments("1");
      }

      // Auto-categorize based on file extension
      const ext = info.name.split(".").pop()?.toLowerCase();
      if (["mp4", "mkv", "avi", "webm"].includes(ext || "")) setCategory("Video");
      else if (["mp3", "flac", "wav"].includes(ext || "")) setCategory("Audio");
      else if (["zip", "rar", "7z", "tar", "gz"].includes(ext || "")) setCategory("Archives");
      else if (["pdf", "epub", "doc"].includes(ext || "")) setCategory("Documents");
      else setCategory("Software");

      setStep(2);
    } catch (e) {
      uiLogger.error("Failed to fetch preflight info", "AddUrl", e as Error);
      // Proceed gracefully even if backend fetch fails
      setMetadata({ name: fetchUrl.split("/").pop() || "download.bin", sizeBytes: 0, acceptRanges: false, error: "Failed to verify source" });
      setSegments("1");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const customHeaders = parseHeaders(headerRaw);
    onAdd({ url: url.trim(), category, segments: parseInt(segments), headers: customHeaders });
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
            <div className="space-y-3">
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

              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[10px] text-primary hover:text-primary-strong font-semibold uppercase tracking-wider flex items-center gap-1.5"
                >
                  {showAdvanced ? "▼ Hide Advanced" : "▶ Show Advanced (Headers)"}
                </button>

                {showAdvanced && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label className="text-[9px] uppercase tracking-wider text-muted-foreground-2">
                      Custom HTTP Headers (Key: Value)
                    </Label>
                    <textarea
                      value={headerRaw}
                      onChange={(e) => setHeaderRaw(e.target.value)}
                      placeholder="Authorization: Bearer mytoken&#10;Cookie: session=abc"
                      className="w-full h-20 bg-surface-2 border border-border rounded-md p-2 font-mono text-[11px] resize-none focus:outline-none focus:border-primary/50 text-foreground"
                    />
                  </div>
                )}
              </div>
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
