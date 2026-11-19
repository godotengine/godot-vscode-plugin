import * as vscode from "vscode";
import { killSubProcesses, subProcess } from "./subspawn";
import { get_configuration } from "./vscode_utils";

export default class GodotTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	constructor(
		private owner: string,
		private command: string,
	) {}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		const proc = subProcess(this.owner, this.command, {
			shell: true,
			detached: get_configuration("terminal.detached")
		});
		this.writeEmitter.fire(`Starting ${this.owner} process...\r\n`);

		proc.stdout.on("data", (data) => {
			const out = data.toString().trim();
			if (out) {
				this.writeEmitter.fire(`${data}\r\n`);
			}
		});

		proc.stderr.on("data", (data) => {
			const out = data.toString().trim();
			if (out) {
				this.writeEmitter.fire(`${data}\r\n`);
			}
		});

		proc.on("close", (code) => {
			this.writeEmitter.fire(`${this.owner} stopped with exit code: ${code}\r\n`);
		});
	}

	close(): void {
		killSubProcesses(this.owner);
	}
}
