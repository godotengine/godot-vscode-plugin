import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandDebugExit extends Command {
	public trigger(parameters: any[]) {
		Mediator.notify("debug_exit");
	}
}
