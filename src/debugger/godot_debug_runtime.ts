import vscode = require("vscode");
import { EventEmitter } from "events";
import { ServerController } from "./communication/server_controller";
import { SceneTreeProvider } from "./SceneTree/scene_tree_provider";
import { InspectorProvider } from "./SceneTree/inspector_provider";

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
	private server_controller: ServerController | undefined;

	constructor() {
		super();
	}

	public break() {
		if (this.paused) {
			this.server_controller?.continue();
		} else {
			this.server_controller?.break();
		}
	}

	public continue() {
		this.server_controller?.continue();
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
				locals: any[];
				members: any[];
				globals: any[];
			}
		) => void
	) {
		this.server_controller?.get_scope(level, callback);
	}

	public get_breakpoints(path: string): GodotBreakpoint[] {
		let bps = this.breakpoints.get(path);
		return bps ? bps : [];
	}

	public inspect_object(
		objectId: number,
		inspected: (className: string, properties: any[]) => void
	) {
		this.server_controller?.inspect_object(objectId, inspected);
	}

	public next() {
		this.server_controller?.next();
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
				this.server_controller?.remove_breakpoint(
					bp.file.replace(new RegExp(`${this.project}/`), "res://"),
					bp.line
				);
			}
		}
	}

	public request_scene_tree() {
		this.server_controller.request_scene_tree();
	}

	public set_object_property(
		object_id: number,
		label: string,
		new_parsed_value: any
	) {
		this.server_controller.set_object_property(object_id, label, new_parsed_value);
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

		this.server_controller?.set_breakpoint(
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
		out: vscode.OutputChannel,
		tree_provider: SceneTreeProvider
	) {
		this.out = out;
		this.out.show();

		this.project = project.replace(/\\/g, "/");
		if (this.project.match(/^[A-Z]:\//)) {
			this.project = this.project[0].toLowerCase() + this.project.slice(1);
		}

		this.server_controller = new ServerController(
			this,
			this.out,
			tree_provider
		);
		let breakpointList: GodotBreakpoint[] = [];
		Array.from(this.breakpoints.values()).forEach(fbp => {
			breakpointList = breakpointList.concat(fbp);
		});
		this.server_controller.start(
			project,
			port,
			address,
			launchGameInstance,
			breakpointList
		);
	}

	public step() {
		this.server_controller?.step();
	}

	public step_out() {
		this.server_controller?.step_out();
	}

	public terminate() {
		this.server_controller?.stop();
	}
}
