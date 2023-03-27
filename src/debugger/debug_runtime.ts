import { SceneTreeProvider } from "./scene_tree_provider";
const path = require("path");

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

export interface GodotVariable {
	name: string;
	scope_path?: string;
	sub_values?: GodotVariable[];
	value: any;
}

export interface GDObject {
	stringify_value(): string;
	sub_values(): GodotVariable[];
	type_name(): string;
}

export class RawObject extends Map<any, any> {
	constructor(public class_name: string) {
		super();
	}
}

export class ObjectId implements GDObject {
	constructor(public id: bigint) {}

	public stringify_value(): string {
		return `<${this.id}>`;
	}

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "Object";
	}
}

export class GodotDebugData {
	private breakpoint_id = 0;
	private breakpoints: Map<string, GodotBreakpoint[]> = new Map();

	public last_frame: GodotStackFrame;
	public last_frames: GodotStackFrame[] = [];
	public project_path: string;
	public scene_tree?: SceneTreeProvider;
	public stack_count: number = 0;
	public stack_files: string[] = [];
	public mediator;

	public constructor(mediator) {
		this.mediator = mediator;
	}

	public get_all_breakpoints(): GodotBreakpoint[] {
		let output: GodotBreakpoint[] = [];
		Array.from(this.breakpoints.values()).forEach((bp_array) => {
			output.push(...bp_array);
		});
		return output;
	}

	public get_breakpoints(path: string) {
		return this.breakpoints.get(path) || [];
	}

	public remove_breakpoint(path_to: string, line: number) {
		let bps = this.breakpoints.get(path_to);

		if (bps) {
			let index = bps.findIndex((bp) => {
				return bp.line === line;
			});
			if (index !== -1) {
				let bp = bps[index];
				bps.splice(index, 1);
				this.breakpoints.set(path_to, bps);
				let file = `res://${path.relative(this.project_path, bp.file)}`;
				this.mediator.notify("remove_breakpoint", [
					file.replace(/\\/g, "/"),
					bp.line,
				]);
			}
		}
	}

	public set_breakpoint(path_to: string, line: number) {
		let bp = {
			file: path_to.replace(/\\/g, "/"),
			line: line,
			id: this.breakpoint_id++,
		};

		let bps: GodotBreakpoint[] = this.breakpoints.get(bp.file);
		if (!bps) {
			bps = [];
			this.breakpoints.set(bp.file, bps);
		}

		bps.push(bp);

		if (this.project_path) {
			let out_file = `res://${path.relative(this.project_path, bp.file)}`;
			this.mediator.notify("set_breakpoint", [out_file.replace(/\\/g, "/"), line]);
		}
	}
}
