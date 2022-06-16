export class Logger {
	protected buffer: string = "";
	protected tag: string = '';
	protected time: boolean = false;
	
	constructor(tag: string, time: boolean) {
		this.tag = tag;
		this.time = time;
	}
	
	clear() {
		this.buffer = "";
	}
	
	log(...messages) {
		
		let line = '';
		if (this.tag) {
			line += `[${this.tag}]`;
		}
		if (this.time) {
			line += `[${new Date().toISOString()}]`;
		}
		if (line) {
			line += ' ';
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

const logger = new Logger('godot-tools', true);
export default logger;
