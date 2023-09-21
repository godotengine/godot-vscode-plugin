import { is_debug_mode } from "./utils";


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

export class Logger2 {
	protected tag: string = "";
	protected level: string = "";
	protected time: boolean = false;

	constructor(tag: string) {
		this.tag = tag;
	}

	log(...messages) {
		let line = "[godotTools]";
		if (this.time) {
			line += `[${new Date().toISOString()}]`;
		}
		if (this.level) {
			line += `[${this.level}]`;
			this.level = "";
		}
		if (this.tag) {
			line += `[${this.tag}]`;
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

		console.log(line);
	}

	info(...messages) {
		// if (is_debug_mode()) { }
		this.level = "INFO";
		this.log(messages);
	}
	debug(...messages) {
		this.level = "DEBUG";
		this.log(messages);
	}
	warn(...messages) {
		this.level = "WARNING";
		this.log(messages);
	}
	error(...messages) {
		this.level = "ERROR";
		this.log(messages);
	}
}


export function createLogger(tag) {
	return new Logger2(tag);
}

const logger = new Logger("godot-tools", true);
export default logger;
