import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandStackFrameVars extends Command {
	public trigger(parameters: any[]) {
		let amount = parameters[0];
		Mediator.notify("stack_frame_vars", [amount]);
	}
}
