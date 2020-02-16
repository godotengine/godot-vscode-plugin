import vscode = require("vscode");
import { EventEmitter } from "events";
import { ServerController } from "./communication/server_controller";

export interface GodotBreakpoint {
	file: string;
	id: number;
	line: number;
}

export interface GodotStackFrame {
	file: string;
	function: string;
	id: number;
	line: number;
}

export class GodotDebugRuntime extends EventEmitter {
	private breakpointId = 0;
	private breakpoints = new Map<string, GodotBreakpoint[]>();
	private out: vscode.OutputChannel | undefined;
	private paused = false;
	private project = "";
	private serverController: ServerController | undefined;

	constructor() {
		super();
	}

	public break() {
		if (this.paused) {
			this.serverController?.continue();
		} else {
			this.serverController?.break();
		}
	}

	public continue() {
		this.serverController?.continue();
	}

	public getProject(): string {
		return this.project;
	}

	public getScope(
		level: number,
		callback?: (
			stackLevel: number,
			stackFiles: string[],
			scopes: {
				locals: { name: string; value: any }[];
				members: { name: string; value: any }[];
				globals: { name: string; value: any }[];
			}
		) => void
	) {
		this.serverController?.get_scope(level, callback);
	}

	public get_breakpoints(path: string): GodotBreakpoint[] {
		let bps = this.breakpoints.get(path);
		return bps ? bps : [];
	}

	public inspect_object(
		objectId: number,
		inspected: (className: string, properties: any[]) => void
	) {
		this.serverController?.inspect_object(objectId, inspected);
	}

	public next() {
		this.serverController?.next();
	}

	public remove_breakpoint(pathTo: string, line: number) {
		let bps = this.breakpoints.get(pathTo);
		if (bps) {
			let index = bps.findIndex(bp => {
				return bp.line === line;
			});
			if (index !== -1) {
				let bp = bps[index];
				bps.splice(index, 1);
				this.breakpoints.set(pathTo, bps);
				this.serverController?.remove_breakpoint(
					bp.file.replace(new RegExp(`${this.project}/`), "res://"),
					bp.line
				);
			}
		}
	}

	public set_breakpoint(pathTo: string, line: number): GodotBreakpoint {
		const BP = {
			file: pathTo.replace(/\\/g, "/"),
			line: line,
			id: this.breakpointId++
		};

		let bps = this.breakpoints.get(BP.file);
		if (!bps) {
			bps = new Array<GodotBreakpoint>();
			this.breakpoints.set(BP.file, bps);
		}

		bps.push(BP);

		this.serverController?.set_breakpoint(
			BP.file.replace(new RegExp(`${this.project}/`), "res://"),
			line
		);

		return BP;
	}

	public start(
		project: string,
		address: string,
		port: number,
		launchGameInstance: boolean,
		out: vscode.OutputChannel
	) {
		this.out = out;
		this.out.show();

		this.project = project.replace(/\\/g, "/");
		if (this.project.match(/^[A-Z]:\//)) {
			this.project = this.project[0].toLowerCase() + this.project.slice(1);
		}

		this.serverController = new ServerController(this, this.out);
		let breakpointList: GodotBreakpoint[] = [];
		Array.from(this.breakpoints.values()).forEach(fbp => {
			breakpointList = breakpointList.concat(fbp);
		});
		this.serverController.start(
			project,
			port,
			address,
			launchGameInstance,
			breakpointList
		);
	}

	public step() {
		this.serverController?.step();
	}

	public terminate() {
		this.serverController?.stop();
	}

	public step_out() {
		this.serverController?.step_out();
	}
}
