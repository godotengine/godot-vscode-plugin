import { Mediator } from "../mediator";

export abstract class Command {
	public abstract trigger(parameters: any[]): void;
}
