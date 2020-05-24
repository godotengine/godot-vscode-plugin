import {
	LoggingDebugSession,
	InitializedEvent,
	Thread,
	Source,
	Breakpoint,
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { Mediator } from "./mediator";
import { GodotDebugData, GodotVariable } from "./debug_runtime";
import { ObjectId, RawObject } from "./variables/variants";
import { ServerController } from "./server_controller";
const { Subject } = require("await-notify");
import fs = require("fs");
import { SceneTreeProvider } from "./scene_tree/scene_tree_provider";

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	address: string;
	launch_game_instance: boolean;
	launch_scene: boolean;
	port: number;
	project: string;
	scene_file: string;
}

export class GodotDebugSession extends LoggingDebugSession {
	private all_scopes: GodotVariable[];
	private controller?: ServerController;
	private debug_data = new GodotDebugData();
	private exception = false;
	private got_scope = new Subject();
	private ongoing_inspections: bigint[] = [];
	private previous_inspections: bigint[] = [];
	private configuration_done = new Subject();

	public constructor() {
		super();

		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		Mediator.set_session(this);
		this.controller = new ServerController();
		Mediator.set_controller(this.controller);
		Mediator.set_debug_data(this.debug_data);
	}

	public dispose() {}

	public set_exception(exception: boolean) {
		this.exception = true;
	}

	public set_inspection(id: bigint, replacement: GodotVariable) {
		let variables = this.all_scopes.filter(
			(va) => va && va.value instanceof ObjectId && va.value.id === id
		);

		variables.forEach((va) => {
			let index = this.all_scopes.findIndex((va_id) => va_id === va);
			let old = this.all_scopes.splice(index, 1);
			replacement.name = old[0].name;
			replacement.scope_path = old[0].scope_path;
			this.append_variable(replacement, index);
		});

		this.ongoing_inspections.splice(
			this.ongoing_inspections.findIndex((va_id) => va_id === id),
			1
		);

		this.previous_inspections.push(id);

		this.add_to_inspections();

		if (this.ongoing_inspections.length === 0) {
			this.previous_inspections = [];
			this.got_scope.notify();
		}
	}

	public set_scene_tree(scene_tree_provider: SceneTreeProvider) {
		this.debug_data.scene_tree = scene_tree_provider;
	}

	public configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments
	) {
		this.configuration_done.notify();
	}

	public set_scopes(
		locals: GodotVariable[],
		members: GodotVariable[],
		globals: GodotVariable[]
	) {
		this.all_scopes = [
			undefined,
			{ name: "local", value: undefined, sub_values: locals, scope_path: "@" },
			{
				name: "member",
				value: undefined,
				sub_values: members,
				scope_path: "@",
			},
			{
				name: "global",
				value: undefined,
				sub_values: globals,
				scope_path: "@",
			},
		];

		locals.forEach((va) => {
			va.scope_path = `@.local`;
			this.append_variable(va);
		});

		members.forEach((va) => {
			va.scope_path = `@.member`;
			this.append_variable(va);
		});

		globals.forEach((va) => {
			va.scope_path = `@.global`;
			this.append_variable(va);
		});

		this.add_to_inspections();

		if (this.ongoing_inspections.length === 0) {
			this.previous_inspections = [];
			this.got_scope.notify();
		}
	}

	protected continueRequest(
		response: DebugProtocol.ContinueResponse,
		args: DebugProtocol.ContinueArguments
	) {
		if (!this.exception) {
			response.body = { allThreadsContinued: true };
			Mediator.notify("continue");
			this.sendResponse(response);
		}
	}

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	) {
		if (this.all_scopes) {
			let expression = args.expression;
			let matches = expression.match(/^[_a-zA-Z0-9]+?$/);
			if (matches) {
				let result_idx = this.all_scopes.findIndex(
					(va) => va && va.name === expression
				);
				if (result_idx !== -1) {
					let result = this.all_scopes[result_idx];
					response.body = {
						result: this.parse_variable(result).value,
						variablesReference: result_idx,
					};
				}
			}
		}

		if (!response.body) {
			response.body = {
				result: "null",
				variablesReference: 0,
			};
		}

		this.sendResponse(response);
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		args: DebugProtocol.InitializeRequestArguments
	) {
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
		this.debug_data.project_path = args.project;
		this.exception = false;
		Mediator.notify("start", [
			args.project,
			args.address,
			args.port,
			args.launch_game_instance,
			args.launch_scene,
			args.scene_file,
		]);
		this.sendResponse(response);
	}

	protected nextRequest(
		response: DebugProtocol.NextResponse,
		args: DebugProtocol.NextArguments
	) {
		if (!this.exception) {
			Mediator.notify("next");
			this.sendResponse(response);
		}
	}

	protected pauseRequest(
		response: DebugProtocol.PauseResponse,
		args: DebugProtocol.PauseArguments
	) {
		if (!this.exception) {
			Mediator.notify("break");
			this.sendResponse(response);
		}
	}

	protected async scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments
	) {
		while (this.ongoing_inspections.length > 0) {
			await this.got_scope.wait(100);
		}
		Mediator.notify("get_scopes", [args.frameId]);
		await this.got_scope.wait(2000);

		response.body = {
			scopes: [
				{ name: "Locals", variablesReference: 1, expensive: false },
				{ name: "Members", variablesReference: 2, expensive: false },
				{ name: "Globals", variablesReference: 3, expensive: false },
			],
		};
		this.sendResponse(response);
	}

	protected setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments
	) {
		let path = (args.source.path as string).replace(/\\/g, "/");
		let client_lines = args.lines || [];

		if (fs.existsSync(path)) {
			let bps = this.debug_data.get_breakpoints(path);
			let bp_lines = bps.map((bp) => bp.line);

			bps.forEach((bp) => {
				if (client_lines.indexOf(bp.line) === -1) {
					this.debug_data.remove_breakpoint(path, bp.line);
				}
			});
			client_lines.forEach((l) => {
				if (bp_lines.indexOf(l) === -1) {
					this.debug_data.set_breakpoint(path, l);
				}
			});

			bps = this.debug_data.get_breakpoints(path);

			response.body = {
				breakpoints: bps.map((bp) => {
					return new Breakpoint(
						true,
						bp.line,
						1,
						new Source(bp.file.split("/").reverse()[0], bp.file)
					);
				}),
			};

			this.sendResponse(response);
		}
	}

	protected stackTraceRequest(
		response: DebugProtocol.StackTraceResponse,
		args: DebugProtocol.StackTraceArguments
	) {
		if (this.debug_data.last_frame) {
			response.body = {
				totalFrames: this.debug_data.last_frames.length,
				stackFrames: this.debug_data.last_frames.map((sf) => {
					return {
						id: sf.id,
						name: sf.function,
						line: sf.line,
						column: 1,
						source: new Source(
							sf.file,
							`${this.debug_data.project_path}/${sf.file.replace("res://", "")}`
						),
					};
				}),
			};
		}
		this.sendResponse(response);
	}

	protected stepInRequest(
		response: DebugProtocol.StepInResponse,
		args: DebugProtocol.StepInArguments
	) {
		if (!this.exception) {
			Mediator.notify("step");
			this.sendResponse(response);
		}
	}

	protected stepOutRequest(
		response: DebugProtocol.StepOutResponse,
		args: DebugProtocol.StepOutArguments
	) {
		if (!this.exception) {
			Mediator.notify("step_out");
			this.sendResponse(response);
		}
	}

	protected terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments
	) {
		Mediator.notify("stop");
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse) {
		response.body = { threads: [new Thread(0, "thread_1")] };
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments
	) {
		let reference = this.all_scopes[args.variablesReference];
		let variables: DebugProtocol.Variable[];

		if (!reference.sub_values) {
			variables = [];
		} else {
			variables = reference.sub_values.map((va) => {
				let sva = this.all_scopes.find(
					(sva) =>
						sva && sva.scope_path === va.scope_path && sva.name === va.name
				);
				if (sva) {
					return this.parse_variable(
						sva,
						this.all_scopes.findIndex(
							(va_idx) =>
								va_idx &&
								va_idx.scope_path ===
									`${reference.scope_path}.${reference.name}` &&
								va_idx.name === va.name
						)
					);
				}
			});
		}

		response.body = {
			variables: variables,
		};

		this.sendResponse(response);
	}

	private add_to_inspections() {
		this.all_scopes.forEach((va) => {
			if (va && va.value instanceof ObjectId) {
				if (
					!this.ongoing_inspections.find((va_id) => va_id === va.value.id) &&
					!this.previous_inspections.find((va_id) => va_id === va.value.id)
				) {
					Mediator.notify("inspect_object", [va.value.id]);
					this.ongoing_inspections.push(va.value.id);
				}
			}
		});
	}

	private append_variable(variable: GodotVariable, index?: number) {
		if (index) {
			this.all_scopes.splice(index, 0, variable);
		} else {
			this.all_scopes.push(variable);
		}
		let base_path = `${variable.scope_path}.${variable.name}`;
		if (variable.sub_values) {
			variable.sub_values.forEach((va, i) => {
				va.scope_path = `${base_path}`;
				this.append_variable(va, index ? index + i + 1 : undefined);
			});
		}
	}

	private parse_variable(va: GodotVariable, i?: number) {
		let value = va.value;
		let rendered_value = "";
		let reference = 0;
		let array_size = 0;
		let array_type = undefined;

		if (typeof value === "number") {
			if (Number.isInteger(value)) {
				rendered_value = `${value}`;
			} else {
				rendered_value = `${parseFloat(value.toFixed(5))}`;
			}
		} else if (
			typeof value === "bigint" ||
			typeof value === "boolean" ||
			typeof value === "string"
		) {
			rendered_value = `${value}`;
		} else if (typeof value === "undefined") {
			rendered_value = "null";
		} else {
			if (Array.isArray(value)) {
				rendered_value = `Array[${value.length}]`;
				array_size = value.length;
				array_type = "indexed";
				reference = i ? i : 0;
			} else if (value instanceof Map) {
				if (value instanceof RawObject) {
					rendered_value = `${value.class_name}`;
				} else {
					rendered_value = `Dictionary[${value.size}]`;
				}
				array_size = value.size;
				array_type = "named";
				reference = i ? i : 0;
			} else {
				rendered_value = `${value.type_name()}${value.stringify_value()}`;
				reference = i ? i : 0;
			}
		}

		return {
			name: va.name,
			value: rendered_value,
			variablesReference: reference,
			array_size: array_size > 0 ? array_size : undefined,
			filter: array_type,
		};
	}
}
