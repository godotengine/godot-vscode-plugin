import { Command } from "../command";
import { Mediator } from "../../mediator";
import { GodotStackFrame } from "../../../debug_runtime";

export class CommandStackDump extends Command {
	public trigger(parameters: any[]) {
		let frames: GodotStackFrame[] = [];
		for (let i = 1; i < parameters.length; i += 3) {
			frames.push({
				id: frames.length,
				file: parameters[i + 0],
				line: parameters[i + 1],
				function: parameters[i + 2],
			});
		}
		Mediator.notify("stack_dump", frames);
	}
}
