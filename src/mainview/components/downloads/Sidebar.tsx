import {
  LayoutGrid,
  Activity,
  ListOrdered,
  CheckCircle2,
  AlertCircle,
  Video,
  Music,
  Package,
  FileText,
  Settings,
} from "lucide-react";
import logoPng from "@/assets/icon-512.png";
import { cn } from "@/lib/utils";
import { formatSpeed } from "@/lib/downloads-data";
import { useDownloadStore, type FilterKey } from "@/store/downloads";

const navItems: {
  key: FilterKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeTone?: "primary" | "success" | "destructive";
}[] = [
  { key: "all", label: "All Downloads", icon: LayoutGrid, badgeTone: "primary" },
  { key: "active", label: "Active", icon: Activity, badgeTone: "success" },
  { key: "queued", label: "Queued", icon: ListOrdered, badgeTone: "primary" },
  { key: "done", label: "Completed", icon: CheckCircle2 },
  { key: "error", label: "Failed", icon: AlertCircle, badgeTone: "destructive" },
];

const categories = [
  { label: "Video", icon: Video },
  { label: "Audio", icon: Music },
  { label: "Software", icon: Package },
  { label: "Documents", icon: FileText },
];
export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { downloads, filter, setFilter } = useDownloadStore();

  const counts = {
    all: downloads.length,
    active: downloads.filter((d) => d.status === "downloading").length,
    queued: downloads.filter((d) => d.status === "queued").length,
    done: downloads.filter((d) => d.status === "done").length,
    error: downloads.filter((d) => d.status === "error").length,
  };

  const totalDownBps = downloads.reduce((s, d) => s + (d.status === "downloading" ? d.speedBps : 0), 0);
  const totalUpBps = totalDownBps * 0.04;

  const maxBps = 30 * 1024 * 1024;
  const downPct = Math.min(100, (totalDownBps / maxBps) * 100);
  const upPct = Math.min(100, (totalUpBps / maxBps) * 100);

  return (
    <aside className="w-[230px] min-w-[230px] bg-surface-1 border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1c1c24] border border-white/5 overflow-hidden"
          style={{ boxShadow: "0 0 15px -5px rgba(79, 70, 229, 0.3)" }}
        >
          <img src={logoPng} className="w-full h-full object-contain" alt="FluxDL Logo" />
        </div>
        <div className="text-[16px] font-semibold tracking-wide">
          Flux<span className="text-primary font-light">DL</span>
        </div>
      </div>

      <SectionLabel>Queue</SectionLabel>
      <nav className="px-2">
        {navItems.map((item) => {
          const count = counts[item.key];
          const active = filter === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-md text-[13px] font-medium transition-colors",
                active
                  ? "bg-surface-3 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="w-[15px] h-[15px] shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "font-mono text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                    item.badgeTone === "success" && "bg-success-strong text-primary-foreground",
                    item.badgeTone === "destructive" && "bg-destructive text-destructive-foreground",
                    (!item.badgeTone || item.badgeTone === "primary") &&
                      "bg-primary text-primary-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <SectionLabel>Categories</SectionLabel>
      <nav className="px-2">
        {categories.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="w-full flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            <Icon className="w-[15px] h-[15px] shrink-0 opacity-80" />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto p-3 border-t border-border space-y-3">
        <div className="bg-surface-2 border border-border rounded-lg p-3.5">
          <SpeedRow
            label="Download"
            value={formatSpeed(totalDownBps)}
            color="success"
            pct={downPct}
          />
          <div className="h-2" />
          <SpeedRow label="Upload" value={formatSpeed(totalUpBps)} color="primary" pct={upPct} />
        </div>
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          <Settings className="w-[15px] h-[15px]" />
          Settings
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1 text-[10px] font-semibold tracking-[0.15em] text-muted-foreground-2 uppercase">
      {children}
    </div>
  );
}

function SpeedRow({
  label,
  value,
  color,
  pct,
}: {
  label: string;
  value: string;
  color: "success" | "primary";
  pct: number;
}) {
  return (
    <>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground-2">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[12px] font-medium",
            color === "success" ? "text-success" : "text-primary",
          )}
        >
          {value}
        </span>
      </div>
      <div className="h-[3px] bg-input rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background:
              color === "success" ? "var(--gradient-success)" : "var(--gradient-progress)",
          }}
        />
      </div>
    </>
  );
}
