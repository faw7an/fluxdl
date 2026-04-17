import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Download } from "../mainview/lib/downloads-data";

export class DBManager {
	private db: Database;

	constructor() {
		const home = process.env.HOME ?? "/tmp";
		const configDir = join(home, ".config", "FluxDL");
		
		try {
			mkdirSync(configDir, { recursive: true });
		} catch {}

		const dbPath = join(configDir, "database.sqlite");
		this.db = new Database(dbPath, { create: true });

		this.initSchema();
	}

	private initSchema() {
		this.db.exec(`PRAGMA journal_mode = WAL;`);
		this.db.exec(`PRAGMA synchronous = NORMAL;`);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS downloads (
				id TEXT PRIMARY KEY,
				name TEXT,
				url TEXT,
				kind TEXT,
				category TEXT,
				sizeBytes INTEGER,
				downloadedBytes INTEGER,
				speedBps INTEGER,
				status TEXT,
				segments INTEGER,
				activeSegments INTEGER,
				addedAt INTEGER,
				source TEXT,
				customHeaders TEXT,
				serverHeaders TEXT,
				error TEXT
			);
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT
			);
		`);
	}

	// ── Downloads ────────────────────────────────────────────────────────
	public getAllDownloads(): Download[] {
		const stmt = this.db.query("SELECT * FROM downloads ORDER BY addedAt DESC");
		const rows = stmt.all() as any[];

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			url: row.url,
			kind: row.kind as Download["kind"],
			category: row.category as Download["category"],
			sizeBytes: Number(row.sizeBytes),
			downloadedBytes: Number(row.downloadedBytes),
			speedBps: Number(row.speedBps),
			status: row.status as Download["status"],
			segments: Number(row.segments),
			activeSegments: Number(row.activeSegments),
			addedAt: Number(row.addedAt),
			source: row.source,
			customHeaders: row.customHeaders ? JSON.parse(row.customHeaders) : undefined,
			serverHeaders: row.serverHeaders ? JSON.parse(row.serverHeaders) : undefined,
			error: row.error || undefined,
		}));
	}

	public insertDownload(d: Download) {
		const stmt = this.db.query(`
			INSERT OR REPLACE INTO downloads (id, name, url, kind, category, sizeBytes, downloadedBytes, speedBps, status, segments, activeSegments, addedAt, source, customHeaders, serverHeaders, error)
			VALUES ($id, $name, $url, $kind, $category, $sizeBytes, $downloadedBytes, $speedBps, $status, $segments, $activeSegments, $addedAt, $source, $customHeaders, $serverHeaders, $error)
		`);
		stmt.run({
			$id: d.id,
			$name: d.name,
			$url: d.url,
			$kind: d.kind,
			$category: d.category,
			$sizeBytes: d.sizeBytes,
			$downloadedBytes: d.downloadedBytes,
			$speedBps: d.speedBps,
			$status: d.status,
			$segments: d.segments,
			$activeSegments: d.activeSegments,
			$addedAt: d.addedAt,
			$source: d.source,
			$customHeaders: d.customHeaders ? JSON.stringify(d.customHeaders) : null,
			$serverHeaders: d.serverHeaders ? JSON.stringify(d.serverHeaders) : null,
			$error: d.error || null,
		});
	}

	public updateDownload(d: Download) {
		// Just reuse insert OR REPLACE since we provide the whole row via primary key
		this.insertDownload(d);
	}

	public deleteDownload(id: string) {
		const stmt = this.db.query("DELETE FROM downloads WHERE id = $id");
		stmt.run({ $id: id });
	}

	// ── Settings ─────────────────────────────────────────────────────────
	public getSetting(key: string, defaultValue: string): string {
		const stmt = this.db.query("SELECT value FROM settings WHERE key = $key");
		const row = stmt.get({ $key: key }) as { value: string } | null;
		return row ? row.value : defaultValue;
	}

	public updateSetting(key: string, value: string) {
		const stmt = this.db.query(`
			INSERT OR REPLACE INTO settings (key, value)
			VALUES ($key, $value)
		`);
		stmt.run({ $key: key, $value: value });
	}

	public getAllSettings(): Record<string, string> {
		const rows = this.db.query("SELECT key, value FROM settings").all() as {key: string, value: string}[];
		const map: Record<string, string> = {};
		for (const r of rows) map[r.key] = r.value;
		return map;
	}

	// ── Lifecycle ────────────────────────────────────────────────────────
    public close() {
        this.db.close();
    }
}
