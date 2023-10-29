
export class Logger {
	protected buffer: string = "";
	protected tag: string = "";
	protected time: boolean = false;

	constructor(tag: string, time: boolean) {
		this.tag = tag;
		this.time = time;
	}

	clear() {
		this.buffer = "";
	}

	log(...messages) {

		let line = "";
		if (this.tag) {
			line += `[${this.tag}]`;
		}
		if (this.time) {
			line += `[${new Date().toISOString()}]`;
		}
		if (line) {
			line += " ";
		}

		for (let index = 0; index < messages.length; index++) {
			line += messages[index];
			if (index < messages.length) {
				line += " ";
			} else {
				line += "\n";
			}
		}

		this.buffer += line;
		console.log(line);
	}

	get_buffer(): string {
		return this.buffer;
	}
}

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

export class Logger2 {
	private show_tag: boolean = true;
	private show_time: boolean;
	private show_label: boolean;
	private show_level: boolean = false;

	constructor(
		private tag: string,
		private level: LOG_LEVEL = LOG_LEVEL.DEBUG,
		{ time = false, label = false }: { time?: boolean, label?: boolean } = {},
	) {
		this.show_time = time;
		this.show_label = label;
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

export function createLogger(tag, level: LOG_LEVEL = LOG_LEVEL.DEBUG) {
	return new Logger2(tag, level);
}

const logger = new Logger("godot-tools", true);
export default logger;
