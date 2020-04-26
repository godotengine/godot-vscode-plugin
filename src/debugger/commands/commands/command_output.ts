import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandOutput extends Command {
	public trigger(parameters: any[]) {
		let lines: string[] = parameters;
		Mediator.notify("output", lines);
	}
}
