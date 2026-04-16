export type DownloadStatus = "downloading" | "paused" | "queued" | "done" | "error";
export type FileKind = "zip" | "mp4" | "iso" | "tar" | "exe" | "pdf" | "mp3" | "deb" | "img";

export interface Download {
  id: string;
  name: string;
  url: string;
  kind: FileKind;
  category: "Video" | "Audio" | "Software" | "Documents" | "Archives";
  sizeBytes: number;
  downloadedBytes: number;
  speedBps: number; // current
  status: DownloadStatus;
  segments: number;
  activeSegments: number;
  addedAt: number; // ms
  source: string; // host
  checksum?: string;
  error?: string;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

export const initialDownloads: Download[] = [
  {
    id: "d1",
    name: "ubuntu-24.04.1-desktop-amd64.iso",
    url: "https://releases.ubuntu.com/24.04.1/ubuntu-24.04.1-desktop-amd64.iso",
    kind: "iso",
    category: "Software",
    sizeBytes: 5.4 * GB,
    downloadedBytes: 3.42 * GB,
    speedBps: 11.2 * MB,
    status: "downloading",
    segments: 8,
    activeSegments: 8,
    addedAt: Date.now() - 1000 * 60 * 12,
    source: "releases.ubuntu.com",
    checksum: "sha256:4f1a…b29c",
  },
  {
    id: "d2",
    name: "Blender.4.2.LTS.Project.Files.zip",
    url: "https://cdn.blender.org/lts/projects-4.2.zip",
    kind: "zip",
    category: "Archives",
    sizeBytes: 12.8 * GB,
    downloadedBytes: 4.1 * GB,
    speedBps: 5.6 * MB,
    status: "downloading",
    segments: 8,
    activeSegments: 6,
    addedAt: Date.now() - 1000 * 60 * 32,
    source: "cdn.blender.org",
  },
  {
    id: "d3",
    name: "BigBuckBunny_4K_HDR.mp4",
    url: "https://media.peach.org/bbb/4k-hdr.mp4",
    kind: "mp4",
    category: "Video",
    sizeBytes: 8.2 * GB,
    downloadedBytes: 1.6 * GB,
    speedBps: 1.6 * MB,
    status: "downloading",
    segments: 8,
    activeSegments: 4,
    addedAt: Date.now() - 1000 * 60 * 4,
    source: "media.peach.org",
  },
  {
    id: "d4",
    name: "JetBrains.IDE.bundle.2025.1.tar.gz",
    url: "https://download.jetbrains.com/bundle/2025.1.tar.gz",
    kind: "tar",
    category: "Software",
    sizeBytes: 3.6 * GB,
    downloadedBytes: 2.1 * GB,
    speedBps: 0,
    status: "paused",
    segments: 8,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 60 * 2,
    source: "download.jetbrains.com",
  },
  {
    id: "d5",
    name: "Adobe.Photoshop.2025.installer.exe",
    url: "https://creativecloud.adobe.com/installer/ps2025.exe",
    kind: "exe",
    category: "Software",
    sizeBytes: 2.4 * GB,
    downloadedBytes: 0,
    speedBps: 0,
    status: "queued",
    segments: 8,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 50,
    source: "creativecloud.adobe.com",
  },
  {
    id: "d6",
    name: "Annual.Report.2024.pdf",
    url: "https://corp.example.com/reports/2024.pdf",
    kind: "pdf",
    category: "Documents",
    sizeBytes: 24 * MB,
    downloadedBytes: 24 * MB,
    speedBps: 0,
    status: "done",
    segments: 4,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 60 * 5,
    source: "corp.example.com",
  },
  {
    id: "d7",
    name: "Lo-Fi.Beats.Vol.7.mp3",
    url: "https://music.cdn.com/lofi/vol7.mp3",
    kind: "mp3",
    category: "Audio",
    sizeBytes: 142 * MB,
    downloadedBytes: 142 * MB,
    speedBps: 0,
    status: "done",
    segments: 4,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 60 * 24,
    source: "music.cdn.com",
  },
  {
    id: "d8",
    name: "docker-desktop_4.32_amd64.deb",
    url: "https://desktop.docker.com/linux/main/amd64/docker-desktop_4.32.deb",
    kind: "deb",
    category: "Software",
    sizeBytes: 480 * MB,
    downloadedBytes: 0,
    speedBps: 0,
    status: "queued",
    segments: 8,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 8,
    source: "desktop.docker.com",
  },
  {
    id: "d9",
    name: "RAW_PhotoShoot_Iceland.zip",
    url: "https://photos.example.com/iceland-raw.zip",
    kind: "zip",
    category: "Archives",
    sizeBytes: 6.4 * GB,
    downloadedBytes: 1.2 * GB,
    speedBps: 0,
    status: "error",
    segments: 8,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 90,
    source: "photos.example.com",
    error: "Connection reset by peer (ECONNRESET)",
  },
  {
    id: "d10",
    name: "node-v22.4.0-linux-x64.tar.xz",
    url: "https://nodejs.org/dist/v22.4.0/node-v22.4.0-linux-x64.tar.xz",
    kind: "tar",
    category: "Software",
    sizeBytes: 38 * MB,
    downloadedBytes: 38 * MB,
    speedBps: 0,
    status: "done",
    segments: 4,
    activeSegments: 0,
    addedAt: Date.now() - 1000 * 60 * 60 * 8,
    source: "nodejs.org",
  },
];

export function formatBytes(b: number, digits = 2): string {
  if (b < KB) return `${b} B`;
  if (b < MB) return `${(b / KB).toFixed(digits)} KB`;
  if (b < GB) return `${(b / MB).toFixed(digits)} MB`;
  return `${(b / GB).toFixed(digits)} GB`;
}

export function formatSpeed(bps: number): string {
  if (bps <= 0) return "—";
  return `${formatBytes(bps)}/s`;
}

export function formatEta(remainingBytes: number, bps: number): string {
  if (bps <= 0 || remainingBytes <= 0) return "—";
  const sec = Math.round(remainingBytes / bps);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const fileKindStyles: Record<FileKind, { label: string; className: string }> = {
  zip: { label: "ZIP", className: "bg-warning/15 text-warning" },
  mp4: { label: "MP4", className: "bg-purple/15 text-purple" },
  iso: { label: "ISO", className: "bg-primary/15 text-primary" },
  tar: { label: "TAR", className: "bg-success/15 text-success" },
  exe: { label: "EXE", className: "bg-destructive/15 text-destructive" },
  pdf: { label: "PDF", className: "bg-warning/15 text-warning" },
  mp3: { label: "MP3", className: "bg-purple/15 text-purple" },
  deb: { label: "DEB", className: "bg-success/15 text-success" },
  img: { label: "IMG", className: "bg-primary/15 text-primary" },
};
