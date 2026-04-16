import { Pause, Play, X, FolderOpen, RotateCw } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  type Download,
  fileKindStyles,
  formatBytes,
  formatEta,
  formatSpeed,
} from "@/lib/downloads-data";

interface Props {
  download: Download;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

const statusStyles: Record<Download["status"], string> = {
  downloading: "bg-primary/15 text-primary",
  paused: "bg-warning/15 text-warning",
  queued: "bg-muted-foreground/15 text-muted-foreground",
  done: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
};

const statusLabels: Record<Download["status"], string> = {
  downloading: "Downloading",
  paused: "Paused",
  queued: "Queued",
  done: "Completed",
  error: "Failed",
};

export const DownloadRow = memo(function DownloadRow({ download, selected, onSelect, onToggle, onRemove }: Props) {
  const pct = (download.downloadedBytes / download.sizeBytes) * 100;
  const remaining = download.sizeBytes - download.downloadedBytes;
  const kindStyle = fileKindStyles[download.kind];

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group bg-surface-1 border rounded-xl p-4 mb-2 cursor-pointer transition-all relative overflow-hidden",
        selected
          ? "border-primary/50 bg-surface-2"
          : "border-border hover:border-input hover:bg-surface-2",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center font-mono text-[10px] font-bold tracking-wider shrink-0",
            kindStyle.className,
          )}
        >
          {kindStyle.label}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{download.name}</div>
          <div className="text-[11px] text-muted-foreground-2 truncate mt-0.5 mb-2">
            {download.url}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider",
                statusStyles[download.status],
              )}
            >
              {statusLabels[download.status]}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground-2">
              {formatBytes(download.downloadedBytes, 1)} /{" "}
              {formatBytes(download.sizeBytes, 1)}
            </span>
            {download.status === "downloading" && (
              <>
                <span className="font-mono text-[11px] text-success">
                  ↓ {formatSpeed(download.speedBps)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground-2">
                  ETA {formatEta(remaining, download.speedBps)}
                </span>
              </>
            )}
            {download.status === "error" && download.error && (
              <span className="text-[11px] text-destructive truncate">{download.error}</span>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {download.status === "error" ? (
            <ActionBtn
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              label="Retry"
            >
              <RotateCw className="w-3 h-3" />
            </ActionBtn>
          ) : download.status !== "done" ? (
            <ActionBtn
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              label={download.status === "paused" ? "Resume" : "Pause"}
            >
              {download.status === "paused" || download.status === "queued" ? (
                <Play className="w-3 h-3" />
              ) : (
                <Pause className="w-3 h-3" />
              )}
            </ActionBtn>
          ) : (
            <ActionBtn onClick={(e) => e.stopPropagation()} label="Open folder">
              <FolderOpen className="w-3 h-3" />
            </ActionBtn>
          )}
          <ActionBtn
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            label="Remove"
            danger
          >
            <X className="w-3 h-3" />
          </ActionBtn>
        </div>
      </div>

      {/* Progress */}
      {download.status !== "done" && download.status !== "queued" && (
        <div className="mt-3">
          <div className="h-[3px] bg-surface-3 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                download.status === "downloading" && "shimmer-bar",
                download.status === "paused" && "bg-warning",
                download.status === "error" && "bg-destructive",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px] text-muted-foreground font-medium">
              {pct.toFixed(1)}%
            </span>
            <span className="font-mono text-[10px] text-muted-foreground-2">
              {download.activeSegments}/{download.segments} connections
            </span>
          </div>
          {/* segments */}
          <div className="flex gap-[2px] h-[3px] mt-1.5">
            {Array.from({ length: download.segments }).map((_, i) => {
              const segDone = i < Math.floor((pct / 100) * download.segments);
              const segActive = i < download.activeSegments && !segDone;
              return (
                <div
                  key={i}
                  className={cn(
                    "h-full flex-1 rounded-sm",
                    segDone && "bg-primary-deep",
                    segActive && "bg-primary",
                    !segDone && !segActive && "bg-surface-3",
                  )}
                />
              );
            })}
          </div>
        </div>
      )}

      {download.status === "done" && (
        <div className="mt-3 h-[3px] bg-success/30 rounded-full overflow-hidden">
          <div className="h-full w-full bg-success-strong" />
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.selected === next.selected &&
    prev.download.downloadedBytes === next.download.downloadedBytes &&
    prev.download.status === next.download.status &&
    prev.download.speedBps === next.download.speedBps &&
    prev.download.activeSegments === next.download.activeSegments
  );
});

function ActionBtn({
  children,
  onClick,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "w-7 h-7 rounded-md border border-border bg-surface-3 flex items-center justify-center transition-colors text-muted-foreground",
        danger
          ? "hover:bg-destructive/20 hover:border-destructive/40 hover:text-destructive"
          : "hover:bg-surface-2 hover:border-input hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
