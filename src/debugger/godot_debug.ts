import {
	LoggingDebugSession,
	InitializedEvent,
	TerminatedEvent,
	StoppedEvent,
	Thread,
	Source,
	Breakpoint
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { window, OutputChannel } from "vscode";
const { Subject } = require("await-notify");
import { GodotDebugRuntime, GodotStackFrame } from "./godot_debug_runtime";
import { VariableScope, VariableScopeBuilder } from "./variable_scope";
import { SceneTreeProvider } from "./SceneTree/scene_tree_provider";
import stringify from "./stringify";
import fs = require("fs");

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	address: string;
	launch_game_instance: boolean;
	port: number;
	project: string;
}

var output_channel: OutputChannel | undefined;

export class GodotDebugSession extends LoggingDebugSession {
	private static MAIN_THREAD_ID = 0;

	private configuration_done = new Subject();
	private current_stack_level = 0;
	private excepted = false;
	private have_scopes: (() => void)[] = [];
	private last_frames: GodotStackFrame[] = [];
	private last_inspection_id = -1;
	private last_inspection_name = "";
	private runtime: GodotDebugRuntime;
	private scope_builder: VariableScopeBuilder | undefined;
	private tree_provider: SceneTreeProvider | undefined;

	public constructor() {
		super();

		if (!output_channel) {
			output_channel = window.createOutputChannel("Godot");
		} else {
			output_channel.clear();
		}

		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		this.runtime = new GodotDebugRuntime();

		this.runtime.on("stopOnBreakpoint", frames => {
			this.last_frames = frames;
			this.sendEvent(
				new StoppedEvent("breakpoint", GodotDebugSession.MAIN_THREAD_ID)
			);
		});

		this.runtime.on("stopOnException", (frames, exception) => {
			this.last_frames = frames;
			this.sendEvent(
				new StoppedEvent(
					"exception",
					GodotDebugSession.MAIN_THREAD_ID,
					exception
				)
			);
		});

		this.runtime.on("terminated", () => {
			this.sendEvent(new TerminatedEvent(false));
		});
	}

	public dispose() {}

	public get_last_id(): number {
		return this.last_inspection_id;
	}

	public inspect_node(
		object_name: string,
		object_id: number,
		inspected: (class_name: string, properties: any[]) => void
	) {
		this.last_inspection_id = object_id;
		this.last_inspection_name = object_name;
		this.runtime.inspect_object(object_id, inspected);
	}

	public reinspect_node(
		callback: (name: string, class_name: string, properties: any[]) => void
	) {
		this.inspect_node(
			this.last_inspection_name,
			this.last_inspection_id,
			(class_name, properties) => {
				callback(this.last_inspection_name, class_name, properties);
			}
		);
	}

	public request_scene_tree() {
		this.runtime.request_scene_tree();
	}

	public set_object_property(
		object_id: number,
		label: string,
		new_parsed_value: any
	) {
		this.runtime.set_object_property(object_id, label, new_parsed_value);
	}

	public set_tree_provider(tree_provider: SceneTreeProvider) {
		this.tree_provider = tree_provider;
	}

	protected configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments
	): void {
		super.configurationDoneRequest(response, args);

		this.configuration_done.notify();
	}

	protected continueRequest(
		response: DebugProtocol.ContinueResponse,
		args: DebugProtocol.ContinueArguments
	): void {
		if (this.excepted) {
			return;
		}

		response.body = {
			allThreadsContinued: true
		};

		this.runtime.continue();

		this.sendResponse(response);
	}

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	) {
		this.have_scopes.push(() => {
			if (args.expression.match(/[^a-zA-Z0-9_\[\]\.]/g)) {
				response.body = {
					result: "not supported",
					variablesReference: 0
				};
				this.sendResponse(response);
				return;
			}

			let is_self = args.expression.match(/^self\./);
			let expression = args.expression
				.replace(/[\[\]]/g, ".")
				.replace(/\.$/, "")
				.replace(/^self./, "");
			let variable: { name: string; value: any } | undefined;
			let scope_keys = this.scope_builder.get_keys(this.current_stack_level);
			let variable_id = -1;
			for (let i = 0; i < scope_keys.length; ++i) {
				let scopes = this.scope_builder.get(
					this.current_stack_level,
					scope_keys[i]
				);

				for (let l = is_self ? 1 : 0; l < 3; ++l) {
					variable_id = scopes[l].get_id_for(expression);
					if (variable_id !== -1) {
						variable = scopes[l].get_variable(variable_id);
						break;
					}
				}

				if (variable) {
					break;
				}
			}

			if (!variable) {
				response.body = {
					result: "not available",
					variablesReference: 0
				};

				this.sendResponse(response);
				return;
			}

			let value_type_pair = stringify(variable.value);

			response.body = {
				result: value_type_pair.value,
				type: value_type_pair.type,
				variablesReference: variable_id
			};

			this.sendResponse(response);
		});
		if (
			this.scope_builder.size() > 0 &&
			this.scope_builder.get_keys(this.current_stack_level).length > 0
		) {
			this.have_scopes.shift()();
		}
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		args: DebugProtocol.InitializeRequestArguments
	): void {
		response.body = response.body || {};

		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsTerminateRequest = true;

		response.body.supportsEvaluateForHovers = false;

		response.body.supportsStepBack = false;
		response.body.supportsGotoTargetsRequest = false;

		response.body.supportsCancelRequest = false;

		response.body.supportsCompletionsRequest = false;

		response.body.supportsFunctionBreakpoints = false;
		response.body.supportsDataBreakpoints = false;
		response.body.supportsBreakpointLocationsRequest = false;
		response.body.supportsConditionalBreakpoints = false;
		response.body.supportsHitConditionalBreakpoints = false;

		response.body.supportsLogPoints = false;

		response.body.supportsModulesRequest = false;

		response.body.supportsReadMemoryRequest = false;

		response.body.supportsRestartFrame = false;
		response.body.supportsRestartRequest = false;

		response.body.supportsSetExpression = false;

		//TODO: Implement
		response.body.supportsSetVariable = false;

		response.body.supportsStepInTargetsRequest = false;

		response.body.supportsTerminateThreadsRequest = false;

		this.sendResponse(response);

		this.sendEvent(new InitializedEvent());
	}

	protected async launchRequest(
		response: DebugProtocol.LaunchResponse,
		args: LaunchRequestArguments
	) {
		await this.configuration_done.wait(1000);
		this.excepted = false;
		this.runtime.start(
			args.project,
			args.address,
			args.port,
			args.launch_game_instance,
			output_channel,
			this.tree_provider
		);
		this.sendResponse(response);
	}

	protected nextRequest(
		response: DebugProtocol.NextResponse,
		args: DebugProtocol.NextArguments
	): void {
		if (this.excepted) {
			return;
		}
		this.runtime.next();
		this.sendResponse(response);
	}

	protected pauseRequest(
		response: DebugProtocol.PauseResponse,
		args: DebugProtocol.PauseArguments
	): void {
		if (this.excepted) {
			return;
		}
		this.runtime.break();
		this.sendResponse(response);
	}

	protected scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments
	): void {
		this.runtime.getScope(args.frameId, (stack_level, stack_files, scopes) => {
			this.current_stack_level = stack_level;
			this.scope_builder = new VariableScopeBuilder(
				this.runtime,
				stack_level,
				stack_files,
				scopes,
				this.have_scopes
			);
			this.scope_builder.parse(over_scopes => {
				response.body = { scopes: over_scopes };
				this.sendResponse(response);
			});
		});
	}

	protected setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments
	): void {
		let path = (args.source.path as string).replace(/\\/g, "/");
		let client_lines = args.lines || [];

		if (fs.existsSync(path)) {
			let bps = this.runtime.get_breakpoints(path);
			let bp_lines = bps.map(bp => bp.line);

			bps.forEach(bp => {
				if (client_lines.indexOf(bp.line) === -1) {
					this.runtime.remove_breakpoint(path, bp.line);
				}
			});
			client_lines.forEach(l => {
				if (bp_lines.indexOf(l) === -1) {
					this.runtime.set_breakpoint(path, l);
				}
			});

			bps = this.runtime.get_breakpoints(path);

			response.body = {
				breakpoints: bps.map(bp => {
					return new Breakpoint(
						true,
						bp.line,
						1,
						new Source(bp.file.split("/").reverse()[0], bp.file, bp.id)
					);
				})
			};

			this.sendResponse(response);
		}
	}

	protected setExceptionBreakPointsRequest(
		response: DebugProtocol.SetExceptionBreakpointsResponse,
		args: DebugProtocol.SetExceptionBreakpointsArguments
	) {
		this.excepted = true;
		this.sendResponse(response);
	}

	protected stackTraceRequest(
		response: DebugProtocol.StackTraceResponse,
		args: DebugProtocol.StackTraceArguments
	): void {
		if (this.last_frames) {
			response.body = {
				totalFrames: this.last_frames.length,
				stackFrames: this.last_frames.map(sf => {
					return {
						id: sf.id,
						name: sf.function,
						line: sf.line,
						column: 1,
						source: new Source(
							sf.file,
							`${this.runtime.getProject()}/${sf.file.replace("res://", "")}`
						)
					};
				})
			};
		}
		this.sendResponse(response);
	}

	protected stepInRequest(
		response: DebugProtocol.StepInResponse,
		args: DebugProtocol.StepInArguments
	) {
		if (this.excepted) {
			return;
		}
		this.runtime.step();
		this.sendResponse(response);
	}

	protected stepOutRequest(
		response: DebugProtocol.StepOutResponse,
		args: DebugProtocol.StepOutArguments
	) {
		if (this.excepted) {
			return;
		}

		this.runtime.step_out();

		this.sendResponse(response);
	}

	protected terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments
	) {
		this.runtime.terminate();
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		response.body = {
			threads: [new Thread(GodotDebugSession.MAIN_THREAD_ID, "thread_1")]
		};
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments,
		request?: DebugProtocol.Request
	) {
		let out_id = args.variablesReference;
		let files = this.scope_builder.get_keys(this.current_stack_level);

		let out_scope_object = this.get_variable_scope(files, out_id);
		let is_scope = out_scope_object.isScope;
		let out_scope = out_scope_object.scope;

		if (out_scope) {
			if (is_scope) {
				let var_ids = out_scope.get_variable_ids();
				response.body = {
					variables: this.parse_scope(var_ids, out_scope)
				};
			} else {
				let variable = out_scope.get_variable(out_id);
				if (variable) {
					let sub_variables = out_scope.get_sub_variables_for(out_id);
					if (sub_variables) {
						let ids = out_scope.get_variable_ids();
						let path_to = variable.name;
						response.body = {
							variables: []
						};

						if (args.filter === "indexed") {
							let count = args.count || 0;
							for (let i = 0; i < count; i++) {
								let name = `${path_to}.${i}`;
								let id_index = ids.findIndex(id => {
									let variable = out_scope?.get_variable(id);
									return variable && name === variable.name;
								});

								response.body.variables.push(
									this.get_variable_response(
										name,
										variable.value[i],
										ids[id_index]
									)
								);
							}
						} else {
							sub_variables.forEach(sv => {
								let name = sv.name;
								let id_index = ids.findIndex(id => {
									let variable = out_scope?.get_variable(id);
									return variable && name === variable.name;
								});

								response.body.variables.push(
									this.get_variable_response(name, sv.value, ids[id_index])
								);
							});
						}
					} else {
						response.body = {
							variables: [
								this.get_variable_response(
									variable.name,
									variable.value,
									0,
									true
								)
							]
						};
					}
				} else {
					response.body = { variables: [] };
				}
			}

			this.sendResponse(response);
		}
	}

	private get_variable_response(
		var_name: string,
		var_value: any,
		id: number,
		skip_sub_var?: boolean
	) {
		let value = "";
		let ref_id = 0;
		let array_count = 0;
		let type = "";
		if (!skip_sub_var) {
			let output = stringify(var_value);

			value = output.value;
			type = output.type;
			ref_id = output.skip_id ? 0 : id;
		}
		return {
			name: var_name.replace(/([a-zA-Z0-9_]+?\.)*/g, ""),
			value: value,
			variablesReference: ref_id,
			indexedVariables: array_count,
			type: type
		};
	}

	private get_variable_scope(files: string[], scope_id: number) {
		let out_scope: VariableScope | undefined;
		let is_scope = false;
		for (let i = 0; i < files.length; i++) {
			let file = files[i];

			let scopes = this.scope_builder.get(this.current_stack_level, file);
			if (scopes) {
				let index = scopes.findIndex(s => {
					return s.id === scope_id;
				});
				if (index !== -1) {
					out_scope = scopes[index];
					is_scope = true;
					break;
				} else {
					for (let l = 0; l < scopes.length; l++) {
						let scope = scopes[l];
						let ids = scope.get_variable_ids();
						for (let k = 0; k < ids.length; k++) {
							let id = ids[k];
							if (scope_id === id) {
								out_scope = scope;
								is_scope = false;
								break;
							}
						}
					}
				}
			}
		}

		return { isScope: is_scope, scope: out_scope };
	}

	private parse_scope(var_ids: number[], out_scope: VariableScope) {
		let output: DebugProtocol.Variable[] = [];
		var_ids.forEach(id => {
			let variable = out_scope?.get_variable(id);
			if (variable && variable.name.indexOf(".") === -1) {
				output.push(
					this.get_variable_response(variable.name, variable.value, id)
				);
			}
		});

		return output;
	}
}
