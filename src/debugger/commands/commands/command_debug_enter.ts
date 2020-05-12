import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandDebugEnter extends Command {
	public trigger(parameters: any[]) {
		let reason: string = parameters[1];
		Mediator.notify("debug_enter", [reason]);
	}
}
