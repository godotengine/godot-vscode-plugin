import { Command } from "../command";
import { Mediator } from "../../mediator";

export class CommandStackFrameVars extends Command {
	public trigger(parameters: any[]) {
		let globals: any[] = [];
		let locals: any[] = [];
		let members: any[] = [];

		let local_count = parameters[0] * 2;
		let member_count = parameters[1 + local_count] * 2;
		let global_count = parameters[2 + local_count + member_count] * 2;

		if (local_count > 0) {
			let offset = 1;
			locals = parameters.slice(offset, offset + local_count);
		}

		if (member_count > 0) {
			let offset = 2 + local_count;
			members = parameters.slice(offset, offset + member_count);
		}

		if (global_count > 0) {
			let offset = 3 + local_count + member_count;
			globals = parameters.slice(offset, offset + global_count);
		}

		Mediator.notify("stack_frame_vars", [locals, members, globals]);
	}
}
