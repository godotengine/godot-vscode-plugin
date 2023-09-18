import {
	LoggingDebugSession,
	InitializedEvent,
	Thread,
	Source,
	Breakpoint,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { GodotDebugData, GodotVariable } from "../debug_runtime";
import { ObjectId, RawObject } from "./variables/variants";
import { ServerController } from "./server_controller";
import { Subject } from "await-notify";
import fs = require("fs");
import { SceneTreeProvider } from "../scene_tree_provider";
import { get_configuration } from "../../utils";
import { createLogger } from "../../logger";

const log = createLogger("debugger.session");

// TODO: remove extra fields
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	address: string;
	launch_game_instance: boolean;
	launch_scene: boolean;
	port: number;
	project: string;
	scene_file: string;
	additional_options: string;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	address: string;
	port: number;
	project: string;
	scene_file: string;
	additional_options: string;
}

export class GodotDebugSession extends LoggingDebugSession {
	private all_scopes: GodotVariable[];
	public controller?: ServerController;
	public debug_data = new GodotDebugData(this);
	private exception = false;
	private got_scope = new Subject();
	private ongoing_inspections: bigint[] = [];
	private previous_inspections: bigint[] = [];
	private configuration_done = new Subject();
	private mode: "launch" | "attach" | "" = "";
	public inspect_callbacks: Map<
		number,
		(class_name: string, variable: GodotVariable) => void
	> = new Map();

	public constructor() {
		super();

		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		this.controller = new ServerController(this);
	}

	public dispose() {}

	public set_exception(exception: boolean) {
		log.debug("set_exception");
		this.exception = true;
	}

	public set_inspection(id: bigint, replacement: GodotVariable) {
		log.debug("set_inspection");
		const variables = this.all_scopes.filter(
			(va) => va && va.value instanceof ObjectId && va.value.id === id
		);

		variables.forEach((va) => {
			const index = this.all_scopes.findIndex((va_id) => va_id === va);
			const old = this.all_scopes.splice(index, 1);
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
		log.debug("configurationDoneRequest");
		this.configuration_done.notify();
		this.sendResponse(response);
	}

	public set_scopes(
		locals: GodotVariable[],
		members: GodotVariable[],
		globals: GodotVariable[]
	) {
		log.debug("set_scopes", JSON.stringify(locals), JSON.stringify(members), JSON.stringify(globals));
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
			va.scope_path = "@.local";
			this.append_variable(va);
		});

		members.forEach((va) => {
			va.scope_path = "@.member";
			this.append_variable(va);
		});

		globals.forEach((va) => {
			va.scope_path = "@.global";
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
		log.debug("continueRequest");
		if (!this.exception) {
			response.body = { allThreadsContinued: true };
			this.controller?.continue();
			this.sendResponse(response);
		}
	}

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	) {
		log.debug("evaluateRequest", JSON.stringify(args));
		
		if (this.all_scopes) {
			const expression = args.expression;
			const matches = expression.match(/^[_a-zA-Z0-9]+?$/);
			if (matches) {
				const result_idx = this.all_scopes.findIndex(
					(va) => va && va.name === expression
				);
				if (result_idx !== -1) {
					const result = this.all_scopes[result_idx];
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
		log.debug("launchRequest");

		this.mode = "launch";

		this.debug_data.project_path = args.project;
		this.exception = false;
		this.controller?.launch(args, this.debug_data);
		
		this.sendResponse(response);
	}

	protected async attachRequest(
		response: DebugProtocol.AttachResponse,
		args: AttachRequestArguments
	) {
		await this.configuration_done.wait(1000);
		log.debug("attachRequest");

		this.mode = "attach";

		this.exception = false;
		this.controller?.attach(args, this.debug_data);

		this.sendResponse(response);
	}

	protected nextRequest(
		response: DebugProtocol.NextResponse,
		args: DebugProtocol.NextArguments
	) {
		log.debug("nextRequest", this.exception);
		if (!this.exception) {
			this.controller?.next();
			this.sendResponse(response);
		}
	}

	protected pauseRequest(
		response: DebugProtocol.PauseResponse,
		args: DebugProtocol.PauseArguments
	) {
		log.debug("pauseRequest");
		if (!this.exception) {
			this.controller?.break();
			this.sendResponse(response);
		}
	}

	protected async scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments
	) {
		log.debug("scopesRequest", JSON.stringify(args));
		while (this.ongoing_inspections.length > 0) {
			await this.got_scope.wait(100);
		}
		this.controller?.send_scope_request(args.frameId);
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
		log.debug("setBreakPointsRequest");
		const path = (args.source.path as string).replace(/\\/g, "/");
		const client_lines = args.lines || [];

		if (fs.existsSync(path)) {
			let bps = this.debug_data.get_breakpoints(path);
			const bp_lines = bps.map((bp) => bp.line);

			bps.forEach((bp) => {
				if (client_lines.indexOf(bp.line) === -1) {
					this.debug_data.remove_breakpoint(path, bp.line);
				}
			});
			client_lines.forEach((l) => {
				if (bp_lines.indexOf(l) === -1) {
					const bp = args.breakpoints.find((bp_at_line) => (bp_at_line.line == l));
					if (!bp.condition) {
						this.debug_data.set_breakpoint(path, l);
					}
				}
			});

			bps = this.debug_data.get_breakpoints(path);
			// Sort to ensure breakpoints aren't out-of-order, which would confuse VS Code.
			bps.sort((a, b) => (a.line < b.line ? -1 : 1));

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
		log.debug("stepInRequest");
		if (!this.exception) {
			this.controller?.step();
			this.sendResponse(response);
		}
	}

	protected stepOutRequest(
		response: DebugProtocol.StepOutResponse,
		args: DebugProtocol.StepOutArguments
	) {
		log.debug("stepOutRequest");
		if (!this.exception) {
			this.controller?.step_out();
			this.sendResponse(response);
		}
	}

	protected terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments
	) {
		log.debug(`terminateRequest ${this.mode}`);
		if (this.mode === "launch") {
			this.controller?.stop();
			this.sendEvent(new TerminatedEvent());
		}
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse) {
		log.debug("threadsRequest");
		response.body = { threads: [new Thread(0, "thread_1")] };
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments
	) {
		log.debug("variablesRequest", JSON.stringify(args));
		if (!this.all_scopes) {
			log.debug("no vars");
			response.body = {
				variables: []
			};
			this.sendResponse(response);
			return;
		}

		const reference = this.all_scopes[args.variablesReference];
		let variables: DebugProtocol.Variable[];

		// log.debug(JSON.stringify(this.all_scopes));
		// log.debug(JSON.stringify(reference));
		// log.debug(reference.sub_values);

		if (!reference.sub_values) {
			log.debug("!reference.sub_values");
			variables = [];
		} else {
			log.debug("reference.sub_values");
			variables = reference.sub_values.map((va) => {
				const sva = this.all_scopes.find(
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
		log.debug("add_to_inspections", JSON.stringify(this.all_scopes));
		this.all_scopes.forEach((va) => {
			if (va && va.value instanceof ObjectId) {
				if (
					!this.ongoing_inspections.find((va_id) => va_id === va.value.id) &&
					!this.previous_inspections.find((va_id) => va_id === va.value.id)
				) {
					// TODO: implement me
					// Mediator.notify("inspect_object", [va.value.id]);
					this.ongoing_inspections.push(va.value.id);
				}
			}
		});
	}

	private append_variable(variable: GodotVariable, index?: number) {
		log.debug("append_variable", JSON.stringify(variable));
		if (index) {
			this.all_scopes.splice(index, 0, variable);
		} else {
			this.all_scopes.push(variable);
		}
		const base_path = `${variable.scope_path}.${variable.name}`;
		if (variable.sub_values) {
			variable.sub_values.forEach((va, i) => {
				va.scope_path = `${base_path}`;
				this.append_variable(va, index ? index + i + 1 : undefined);
			});
		}
	}

	private parse_variable(va: GodotVariable, i?: number) {
		log.debug("parse_variable", JSON.stringify(va), i);
		const value = va.value;
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
