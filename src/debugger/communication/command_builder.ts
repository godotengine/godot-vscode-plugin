import { Command } from "./command";
import { VariantParser } from "../variant_parser";

export class CommandBuilder {
	private commands = new Map<string, Command>();
	private current_command?: Command;
	private dummy_command = new Command("---");

	constructor() {}

	public create_buffered_command(
		command: string,
		parser: VariantParser,
		parameters?: any[]
	): Buffer {
		let command_array: any[] = [command];
		if (parameters) {
			parameters?.forEach(param => {
				command_array.push(param);
			});
		}

		let buffer = parser.encode_variant(command_array);
		return buffer;
	}

	public parse_data(
		dataset: Array<any>,
		error_callback: (error: string) => void
	): void {
		while (dataset && dataset.length > 0) {
			if (this.current_command) {
				let next_command = this.current_command.chain();
				if (next_command === this.current_command) {
					this.current_command.append_parameters(dataset.shift());
				} else {
					this.current_command = next_command;
				}
			} else {
				let data = dataset.shift();
				if (data) {
					let command = this.commands.get(data);
					if (command) {
						this.current_command = command;
					} else {
						error_callback(`Unsupported command: ${data}. Skipping.`);
						this.current_command = this.dummy_command;
					}
				}
			}
		}
	}

	public register_command(command: Command) {
		let name = command.name;
		this.commands.set(name, command);
	}
}
