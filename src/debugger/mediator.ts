import { ServerController } from "./server_controller";
import { window, OutputChannel } from "vscode";
import { GodotDebugSession } from "./debug_session";
import { StoppedEvent, TerminatedEvent } from "vscode-debugadapter";
import { GodotDebugData, GodotVariable } from "./debug_runtime";

export class Mediator {
	private static controller?: ServerController;
	private static debug_data?: GodotDebugData;
	private static inspect_callbacks: Map<
		number,
		(class_name: string, variable: GodotVariable) => void
	> = new Map();
	private static session?: GodotDebugSession;
	private static first_output = false;
	private static output: OutputChannel = window.createOutputChannel("Godot");

	private constructor() {}

	public static notify(event: string, parameters: any[] = []) {
		switch (event) {
			case "output":
				if (!this.first_output) {
					this.first_output = true;
					this.output.show(true);
					this.output.clear();
					this.controller?.send_request_scene_tree_command();
				}

				let lines: string[] = parameters;
				lines.forEach((line) => {
					this.output.appendLine(line);
				});
				break;

			case "continue":
				this.controller?.continue();
				break;

			case "next":
				this.controller?.next();
				break;

			case "step":
				this.controller?.step();
				break;

			case "step_out":
				this.controller?.step_out();
				break;

			case "inspect_object":
				this.controller?.send_inspect_object_request(parameters[0]);
				if (parameters[1]) {
					this.inspect_callbacks.set(parameters[0], parameters[1]);
				}
				break;

			case "inspected_object":
				let inspected_variable = { name: "", value: parameters[1] };
				this.build_sub_values(inspected_variable);
				if (this.inspect_callbacks.has(Number(parameters[0]))) {
					this.inspect_callbacks.get(Number(parameters[0]))(
						inspected_variable.name,
						inspected_variable
					);
					this.inspect_callbacks.delete(Number(parameters[0]));
				} else {
					this.session?.set_inspection(parameters[0], inspected_variable);
				}
				break;

			case "stack_dump":
				this.controller?.trigger_breakpoint(parameters);
				this.controller?.send_request_scene_tree_command();
				break;

			case "request_scene_tree":
				this.controller?.send_request_scene_tree_command();
				break;

			case "scene_tree":
				this.debug_data?.scene_tree?.fill_tree(parameters[0]);
				break;

			case "get_scopes":
				this.controller?.send_scope_request(parameters[0]);
				break;

			case "stack_frame_vars":
				this.do_stack_frame_vars(parameters[0], parameters[1], parameters[2]);
				break;

			case "remove_breakpoint":
				this.controller?.remove_breakpoint(parameters[0], parameters[1]);
				break;

			case "set_breakpoint":
				this.controller?.set_breakpoint(parameters[0], parameters[1]);
				break;

			case "stopped_on_breakpoint":
				this.debug_data.last_frames = parameters[0];
				this.session?.sendEvent(new StoppedEvent("breakpoint", 0));
				break;

			case "stopped_on_exception":
				this.debug_data.last_frames = parameters[0];
				this.session?.set_exception(true);
				this.session?.sendEvent(
					new StoppedEvent("exception", 0, parameters[1])
				);
				break;

			case "break":
				this.controller?.break();
				break;

			case "changed_value":
				this.controller?.set_object_property(
					parameters[0],
					parameters[1],
					parameters[2]
				);
				break;

			case "debug_enter":
				let reason: string = parameters[0];
				if (reason !== "Breakpoint") {
					this.controller?.set_exception(reason);
				} else {
					this.controller?.set_exception("");
				}
				this.controller?.stack_dump();
				break;

			case "start":
				this.first_output = false;
				this.controller?.start(
					parameters[0],
					parameters[1],
					parameters[2],
					parameters[3],
					parameters[4],
					parameters[5],
					this.debug_data
				);
				break;

			case "debug_exit":
				break;

			case "stop":
				this.controller?.stop();
				this.session?.sendEvent(new TerminatedEvent());
				break;

			case "error":
				this.controller?.set_exception(parameters[0]);
				this.controller?.stop();
				this.session?.sendEvent(new TerminatedEvent());
				break;
		}
	}

	public static set_controller(controller: ServerController) {
		this.controller = controller;
	}

	public static set_debug_data(debug_data: GodotDebugData) {
		this.debug_data = debug_data;
	}

	public static set_session(debug_session: GodotDebugSession) {
		this.session = debug_session;
	}

	private static build_sub_values(va: GodotVariable) {
		let value = va.value;

		let sub_values: GodotVariable[] = undefined;

		if (value && Array.isArray(value)) {
			sub_values = value.map((va, i) => {
				return { name: `${i}`, value: va } as GodotVariable;
			});
		} else if (value instanceof Map) {
			sub_values = Array.from(value.keys()).map((va) => {
				if (typeof va["stringify_value"] === "function") {
					return {
						name: `${va.type_name()}${va.stringify_value()}`,
						value: value.get(va),
					} as GodotVariable;
				} else {
					return {
						name: `${va}`,
						value: value.get(va),
					} as GodotVariable;
				}
			});
		} else if (value && typeof value["sub_values"] === "function") {
			sub_values = value.sub_values().map((sva) => {
				return { name: sva.name, value: sva.value } as GodotVariable;
			});
		}

		va.sub_values = sub_values;

		sub_values?.forEach((sva) => this.build_sub_values(sva));
	}

	private static do_stack_frame_vars(
		locals: any[],
		members: any[],
		globals: any[]
	) {
		let locals_out: GodotVariable[] = [];
		let members_out: GodotVariable[] = [];
		let globals_out: GodotVariable[] = [];

		for (
			let i = 0;
			i < locals.length + members.length + globals.length;
			i += 2
		) {
			const name =
				i < locals.length
					? locals[i]
					: i < members.length + locals.length
					? members[i - locals.length]
					: globals[i - locals.length - members.length];

			const value =
				i < locals.length
					? locals[i + 1]
					: i < members.length + locals.length
					? members[i - locals.length + 1]
					: globals[i - locals.length - members.length + 1];

			let variable: GodotVariable = {
				name: name,
				value: value,
			};

			this.build_sub_values(variable);

			i < locals.length
				? locals_out.push(variable)
				: i < members.length + locals.length
				? members_out.push(variable)
				: globals_out.push(variable);
		}

		this.session?.set_scopes(locals_out, members_out, globals_out);
	}
}
