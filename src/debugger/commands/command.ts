import { Mediator } from "../mediator";

export abstract class Command {
	public param_count: number = -1;

	public abstract trigger(parameters: any[]): void;
}
