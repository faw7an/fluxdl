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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { url: string; category: string; segments: number }) => void;
}

export function AddUrlDialog({ open, onOpenChange, onAdd }: Props) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Software");
  const [segments, setSegments] = useState("8");

  const submit = () => {
    if (!url.trim()) return;
    onAdd({ url: url.trim(), category, segments: parseInt(segments) });
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-1 border-input sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add new download</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground-2">
            Paste a direct URL — Flux will negotiate the fastest segmented transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground-2 font-semibold">
              URL
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="https://example.com/file.zip"
              className="font-mono text-[12px] bg-surface-2 border-border"
              autoFocus
            />
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
              <Select value={segments} onValueChange={setSegments}>
                <SelectTrigger className="bg-surface-2 border-border text-[12px]">
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

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-strong"
          >
            Start download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
