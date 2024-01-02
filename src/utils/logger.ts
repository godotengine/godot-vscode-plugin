import { LogOutputChannel, window } from "vscode";
import { is_debug_mode } from ".";

export enum LOG_LEVEL {
	SILENT,
	ERROR,
	WARNING,
	INFO,
	DEBUG,
	TRACE,
}

const LOG_LEVEL_NAMES = [
	"SILENT",
	"ERROR",
	"WARN ",
	"INFO ",
	"DEBUG",
	"TRACE",
];

const RESET = "\u001b[0m";

const LOG_COLORS = [
	RESET, // SILENT, normal
	"\u001b[1;31m", // ERROR, red
	"\u001b[1;33m", // WARNING, yellow
	"\u001b[1;36m", // INFO, cyan
	"\u001b[1;32m", // DEBUG, green
	"\u001b[1;35m", // TRACE, magenta
];

export interface LoggerOptions {
	level?: LOG_LEVEL
	time?: boolean;
	output?: string;
}

export class Logger {
	private level: LOG_LEVEL = LOG_LEVEL.DEBUG;
	private show_tag: boolean = true;
	private show_time: boolean;
	private show_level: boolean = false;
	private output?: LogOutputChannel;

	constructor(
		private tag: string,
		{ level = LOG_LEVEL.DEBUG, time = false, output = "" }: LoggerOptions = {},
	) {
		this.level = level;
		this.show_time = time;
		if (output) {
			this.output = window.createOutputChannel(output, { log: true });
		}
	}

	private log(level: LOG_LEVEL, ...messages) {
		if (is_debug_mode()) {
			let prefix = "";
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
		}

		if (this.output) {
			switch (level) {
				case LOG_LEVEL.ERROR:
					this.output.error(messages[0]);
					break;
				case LOG_LEVEL.WARNING:
					this.output.warn(messages[0]);
					break;
				case LOG_LEVEL.INFO:
					this.output.info(messages[0]);
					break;
				case LOG_LEVEL.DEBUG:
					this.output.debug(messages[0], ...messages.slice(1));
					break;
				case LOG_LEVEL.TRACE:
					this.output.trace(messages[0]);
					break;
				default:
					break;
			}
		}
	}

	error(...messages) {
		if (LOG_LEVEL.ERROR <= this.level) {
			this.log(LOG_LEVEL.ERROR, ...messages);
		}
	}
	warn(...messages) {
		if (LOG_LEVEL.WARNING <= this.level) {
			this.log(LOG_LEVEL.WARNING, ...messages);
		}
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
	trace(...messages) {
		if (LOG_LEVEL.TRACE <= this.level) {
			this.log(LOG_LEVEL.TRACE, ...messages);
		}
	}
}

const loggers: Map<string, Logger> = new Map();

export function createLogger(tag, options?: LoggerOptions) {
	const logger = new Logger(tag, options);
	loggers.set(tag, logger);
	return logger;
}
