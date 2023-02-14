import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandStackFrameVar extends Command {
	public trigger(parameters: any[]) {
		let name = parameters[0];
		let type = parameters[1];
		let value = parameters[2];
		Mediator.notify("stack_frame_var", [name, value, type]);
	}
}
