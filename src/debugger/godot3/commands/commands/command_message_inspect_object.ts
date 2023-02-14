import { Command } from "../command";
import { RawObject } from "../../variables/variants";
import { Mediator } from "../../mediator";

export class CommandMessageInspectObject extends Command {
	public trigger(parameters: any[]) {
		let id = BigInt(parameters[0]);
		let class_name: string = parameters[1];
		let properties: any[] = parameters[2];

		let raw_object = new RawObject(class_name);
		properties.forEach((prop) => {
			raw_object.set(prop[0], prop[5]);
		});

		Mediator.notify("inspected_object", [id, raw_object]);
	}
}
