import { window } from "vscode";

export enum LOG_LEVEL {
	SILENT,
	ERROR,
	WARNING,
	INFO,
	DEBUG,
}

const LOG_LEVEL_NAMES = [
	"SILENT",
	"ERROR",
	"WARN ",
	"INFO ",
	"DEBUG",
];

const RESET = "\u001b[0m";

const LOG_COLORS = [
	RESET, // SILENT, normal
	"\u001b[1;31m", // ERROR, red
	"\u001b[1;33m", // WARNING, yellow
	"\u001b[1;36m", // INFO, cyan
	"\u001b[1;32m", // DEBUG, green
];

// const output = window.createOutputChannel("Godot", { log: true });

export interface LoggerOptions {
	level?: LOG_LEVEL
	time?: boolean;
	label?: boolean;
	output?: boolean;
}

export class Logger {
	private level: LOG_LEVEL = LOG_LEVEL.DEBUG;
	private show_tag: boolean = true;
	private show_time: boolean;
	private show_label: boolean;
	private show_level: boolean = false;
	private show_output: boolean;

	constructor(
		private tag: string,
		{ level = LOG_LEVEL.DEBUG, time = false, label = false, output = true }: LoggerOptions = {},
	) {
		this.level = level;
		this.show_time = time;
		this.show_label = label;
		this.show_output = output;
	}

	private log(level: LOG_LEVEL, ...messages) {
		let prefix = "";
		if (this.show_label) {
			prefix += "[godotTools]";
		}
		if (this.show_time) {
			prefix += `[${new Date().toISOString()}]`;
		}
		if (this.show_level) {
			prefix += "[" + LOG_COLORS[level] + LOG_LEVEL_NAMES[level] + RESET + "]";
		}
		if (this.show_tag) {
			prefix += "[" + LOG_COLORS[level] + this.tag + RESET + "]";
		}

		console.log(prefix, ...messages);

		// if (this.show_output) {
		// 	const line = `[${this.tag}] ${JSON.stringify(messages)}`;
		// 	switch (level) {
		// 		case LOG_LEVEL.ERROR:
		// 			output.error(line);
		// 			break;
		// 		case LOG_LEVEL.WARNING:
		// 			output.warn(line);
		// 			break;
		// 		case LOG_LEVEL.INFO:
		// 			output.info(line);
		// 			break;
		// 		case LOG_LEVEL.DEBUG:
		// 			output.debug(line);
		// 			break;
		// 		default:
		// 			break;
		// 	}
		// }
	}

	info(...messages) {
		if (LOG_LEVEL.INFO <= this.level) {
			this.log(LOG_LEVEL.INFO, ...messages);
		}
	}
	debug(...messages) {
		if (LOG_LEVEL.DEBUG <= this.level) {
			this.log(LOG_LEVEL.DEBUG, ...messages);
		}
	}
	warn(...messages) {
		if (LOG_LEVEL.WARNING <= this.level) {
			this.log(LOG_LEVEL.WARNING, ...messages);
		}
	}
	error(...messages) {
		if (LOG_LEVEL.ERROR <= this.level) {
			this.log(LOG_LEVEL.ERROR, ...messages);
		}
	}
}

const loggers: Map<string, Logger> = new Map();

export function createLogger(tag, options?: LoggerOptions) {
	const logger = new Logger(tag, options);
	loggers.set(tag, logger);
	return logger;
}
