import { Command } from "../command";
import { Mediator } from "../../mediator";
import { GodotStackFrame } from "../../debug_runtime";

export class CommandStackDump extends Command {
	public trigger(parameters: any[]) {
		let frames: GodotStackFrame[] = parameters.map((sf, i) => {
			return {
				id: i,
				file: sf.get("file"),
				function: sf.get("function"),
				line: sf.get("line"),
			};
		});
		Mediator.notify("stack_dump", frames);
	}
}
