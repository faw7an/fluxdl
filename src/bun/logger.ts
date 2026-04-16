import { createWriteStream, existsSync, statSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

class Logger {
	private stream!: ReturnType<typeof createWriteStream>;
	private logDir: string;
	private logFile: string;

	constructor() {
		const home = process.env.HOME ?? "/tmp";
		this.logDir = join(home, ".config", "FluxDL", "logs");
		this.logFile = join(this.logDir, "app.log");

		this.init();
	}

	private init() {
		try {
			mkdirSync(this.logDir, { recursive: true });
		} catch {}

		// Simple Log Rotation: If app.log is > 5MB on startup, move it to app.old.log
		if (existsSync(this.logFile)) {
			const stats = statSync(this.logFile);
			if (stats.size > 5 * 1024 * 1024) { 
				renameSync(this.logFile, join(this.logDir, "app.old.log"));
			}
		}

		// Use 'a' flag to append. This keeps the file open and streams data fast.
		this.stream = createWriteStream(this.logFile, { flags: "a" });
	}

	private write(level: LogLevel, context: string, message: string, meta?: any) {
		const timestamp = new Date().toISOString();
		let formatted = `[${timestamp}] [${level}] [${context}] ${message}`;
		
		if (meta) {
			formatted += ` | ${meta instanceof Error ? meta.stack : JSON.stringify(meta)}`;
		}

		// Write to disk
		this.stream.write(formatted + "\n");

		// Also output to dev console with some color coding
		if (process.env.NODE_ENV !== "production") {
			const color = level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : level === "DEBUG" ? "\x1b[34m" : "\x1b[32m";
			console.log(`${color}${formatted}\x1b[0m`);
		}
	}

	debug(msg: string, context = "App", meta?: any) { this.write("DEBUG", context, msg, meta); }
	info(msg: string, context = "App", meta?: any) { this.write("INFO", context, msg, meta); }
	warn(msg: string, context = "App", meta?: any) { this.write("WARN", context, msg, meta); }
	error(msg: string, context = "App", meta?: any) { this.write("ERROR", context, msg, meta); }
}

export const logger = new Logger();
