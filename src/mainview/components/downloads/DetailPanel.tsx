import { Pause, Play, X, FolderOpen, Link2, RotateCw } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  fileKindStyles,
  formatBytes,
  formatEta,
  formatSpeed,
} from "@/lib/downloads-data";
import { useDownloadStore } from "@/store/downloads";
import { getRPC } from "@/lib/rpc-helper";

export function DetailPanel() {
  const selectedId = useDownloadStore(state => state.selectedId);
  const download = useDownloadStore(state => state.downloads.find(d => d.id === selectedId) || null);
  const toggleDownload = useDownloadStore(state => state.toggleDownload);
  const removeDownload = useDownloadStore(state => state.removeDownload);

  if (!download) {
    return (
      <aside className="w-[300px] min-w-[300px] bg-surface-1 border-l border-border flex items-center justify-center text-muted-foreground-2 text-sm">
        Select a download
      </aside>
    );
  }

  const pct = download.sizeBytes > 0 ? (download.downloadedBytes / download.sizeBytes) * 100 : 0;
  const remaining = download.sizeBytes - download.downloadedBytes;
  const kindStyle = fileKindStyles[download.kind] || fileKindStyles.img;

  // Generate a fake speed history for chart
  const history = Array.from({ length: 24 }).map((_, i) => {
    if (download.status !== "downloading") return 4 + Math.random() * 6;
    const base = (download.speedBps / (1024 * 1024)) || 8;
    return Math.max(1, base + Math.sin(i / 2) * (base * 0.4) + (Math.random() - 0.5) * 4);
  });
  const maxBar = Math.max(...history, 1);

  const segDone = Math.floor((pct / 100) * download.segments);

  return (
    <aside className="w-[300px] min-w-[300px] bg-surface-1 border-l border-border flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold tracking-wider shrink-0",
            kindStyle.className,
          )}
        >
          {kindStyle.label}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-tight truncate">{download.name}</div>
          <div className="text-[11px] text-muted-foreground-2 mt-0.5">
            {download.category} · {formatBytes(download.sizeBytes, 1)}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Section title="Transfer">
          <Row label="Status" value={download.status} accent="primary" />
          <Row label="Progress" value={`${pct.toFixed(1)}%`} mono />
          <Row label="Downloaded" value={formatBytes(download.downloadedBytes)} mono />
          <Row label="Remaining" value={formatBytes(remaining)} mono />
          <Row
            label="Speed"
            value={formatSpeed(download.speedBps)}
            mono
            accent={download.speedBps > 0 ? "success" : undefined}
          />
          <Row label="ETA" value={formatEta(remaining, download.speedBps)} mono />
        </Section>

        <Section title="Speed (last 60s)">
          <div className="h-16 flex items-end gap-[2px] mt-1">
            {history.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${(v / maxBar) * 100}%`,
                  minHeight: 3,
                  background:
                    download.status === "downloading"
                      ? "var(--gradient-progress)"
                      : "var(--surface-3)",
                  opacity: 0.4 + (i / history.length) * 0.6,
                }}
              />
            ))}
          </div>
        </Section>

        <Section title="Segments">
          <div className="flex gap-[2px] mb-2">
            {Array.from({ length: download.segments }).map((_, i) => {
              const done = i < segDone;
              const active = i < download.activeSegments && !done;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-1.5 rounded-sm",
                    done && "bg-primary-deep",
                    active && "bg-primary",
                    !done && !active && "bg-surface-3",
                  )}
                />
              );
            })}
          </div>
          <Row
            label="Connections"
            value={`${download.activeSegments} of ${download.segments}`}
            mono
          />
        </Section>

        <Section title="Source">
          <Row label="Host" value={download.source} />
          <Row label="Category" value={download.category} />
          {download.checksum && <Row label="Checksum" value={download.checksum} mono />}
        </Section>

        {download.serverHeaders && Object.keys(download.serverHeaders).length > 0 && (
          <Section title="Network Metadata">
            {Object.entries(download.serverHeaders).map(([k, v]) => (
              <Row key={k} label={k} value={v} mono />
            ))}
          </Section>
        )}
      </div>

      <div className="p-4 border-t border-border space-y-2">
        <div className="flex gap-2">
          {download.status === "done" ? (
            <DetailBtn 
              icon={<FolderOpen className="w-3.5 h-3.5" />} 
              primary
              onClick={() => {
                if (download.savePath) {
                  getRPC().request.revealInExplorer({ path: download.savePath });
                }
              }}
            >
              Open Folder
            </DetailBtn>
          ) : download.status === "error" ? (
            <DetailBtn icon={<RotateCw className="w-3.5 h-3.5" />} primary onClick={() => toggleDownload(download.id)}>
              Retry
            </DetailBtn>
          ) : (
            <DetailBtn
              icon={
                download.status === "paused" || download.status === "queued" ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )
              }
              primary
              onClick={() => toggleDownload(download.id)}
            >
              {download.status === "paused" || download.status === "queued" ? "Resume" : "Pause"}
            </DetailBtn>
          )}
          <DetailBtn
            icon={<Link2 className="w-3.5 h-3.5" />}
            onClick={() => navigator.clipboard?.writeText(download.url)}
          >
            Copy URL
          </DetailBtn>
        </div>
        <DetailBtn icon={<X className="w-3.5 h-3.5" />} danger onClick={() => removeDownload(download.id)}>
          Remove from queue
        </DetailBtn>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground-2 uppercase mb-2">
        {title}
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "success" | "primary";
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
      <span className="text-[12px] text-muted-foreground-2">{label}</span>
      <span
        className={cn(
          "text-[12px] truncate ml-3 max-w-[160px] text-right",
          mono && "font-mono",
          accent === "success" && "text-success",
          accent === "primary" && "text-primary capitalize",
          !accent && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DetailBtn({
  children,
  icon,
  primary,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-[12px] font-medium transition-colors border",
        primary && "bg-primary text-primary-foreground border-transparent hover:bg-primary-strong",
        danger &&
          !primary &&
          "border-destructive/30 text-destructive bg-surface-2 hover:bg-destructive/15 w-full",
        !primary && !danger && "bg-surface-2 border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
