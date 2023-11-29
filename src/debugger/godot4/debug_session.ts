import * as fs from "fs";
import {
	LoggingDebugSession,
	InitializedEvent,
	Thread,
	Source,
	Breakpoint,
	StoppedEvent,
	TerminatedEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { debug } from "vscode";
import { Subject } from "await-notify";
import { GodotDebugData, GodotVariable, GodotStackVars } from "../debug_runtime";
import { LaunchRequestArguments, AttachRequestArguments } from "../debugger";
import { SceneTreeProvider } from "../scene_tree_provider";
import { ObjectId } from "./variables/variants";
import { parse_variable, is_variable_built_in_type } from "./helpers";
import { ServerController } from "./server_controller";
import { createLogger } from "../../utils";

const log = createLogger("debugger.session", { output: "Godot Debugger" });

export class GodotDebugSession extends LoggingDebugSession {
	private all_scopes: GodotVariable[];
	public controller = new ServerController(this);
	public debug_data = new GodotDebugData(this);
	public sceneTree: SceneTreeProvider;
	private exception = false;
	private got_scope: Subject = new Subject();
	private ongoing_inspections: bigint[] = [];
	private previous_inspections: bigint[] = [];
	private configuration_done: Subject = new Subject();
	private mode: "launch" | "attach" | "" = "";
	public inspect_callbacks: Map<
		bigint,
		(class_name: string, variable: GodotVariable) => void
	> = new Map();

	public constructor() {
		super();

		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	public dispose() {
		this.controller.stop();
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

		this.mode = "launch";

		this.debug_data.projectPath = args.project;
		this.exception = false;
		await this.controller.launch(args);

		this.sendResponse(response);
	}

	protected async attachRequest(
		response: DebugProtocol.AttachResponse,
		args: AttachRequestArguments
	) {
		await this.configuration_done.wait(1000);

		this.mode = "attach";

		this.exception = false;
		await this.controller.attach(args);

		this.sendResponse(response);
	}

	public configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments
	) {
		this.configuration_done.notify();
		this.sendResponse(response);
	}

	protected continueRequest(
		response: DebugProtocol.ContinueResponse,
		args: DebugProtocol.ContinueArguments
	) {
		if (!this.exception) {
			response.body = { allThreadsContinued: true };
			this.controller.continue();
			this.sendResponse(response);
		}
	}

	protected async evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	) {
		await debug.activeDebugSession.customRequest("scopes", { frameId: 0 });

		if (this.all_scopes) {
			var variable = this.get_variable(args.expression, null, null, null);

			if (variable.error == null) {
				var parsed_variable = parse_variable(variable.variable);
				response.body = {
					result: parsed_variable.value,
					variablesReference: !is_variable_built_in_type(variable.variable) ? variable.index : 0
				};
			} else {
				response.success = false;
				response.message = variable.error;
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

	protected nextRequest(
		response: DebugProtocol.NextResponse,
		args: DebugProtocol.NextArguments
	) {
		if (!this.exception) {
			this.controller.next();
			this.sendResponse(response);
		}
	}

	protected pauseRequest(
		response: DebugProtocol.PauseResponse,
		args: DebugProtocol.PauseArguments
	) {
		if (!this.exception) {
			this.controller.break();
			this.sendResponse(response);
		}
	}

	protected async scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments
	) {
		this.controller.request_stack_frame_vars(args.frameId);
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
							`${this.debug_data.projectPath}/${sf.file.replace("res://", "")}`
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
			this.controller.step();
			this.sendResponse(response);
		}
	}

	protected stepOutRequest(
		response: DebugProtocol.StepOutResponse,
		args: DebugProtocol.StepOutArguments
	) {
		if (!this.exception) {
			this.controller.step_out();
			this.sendResponse(response);
		}
	}

	protected terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments
	) {
		if (this.mode === "launch") {
			this.controller.stop();
			this.sendEvent(new TerminatedEvent());
		}
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
		if (!this.all_scopes) {
			response.body = {
				variables: []
			};
			this.sendResponse(response);
			return;
		}

		const reference = this.all_scopes[args.variablesReference];
		let variables: DebugProtocol.Variable[];

		if (!reference.sub_values) {
			variables = [];
		} else {
			variables = reference.sub_values.map((va) => {
				const sva = this.all_scopes.find(
					(sva) =>
						sva && sva.scope_path === va.scope_path && sva.name === va.name
				);
				if (sva) {
					return parse_variable(
						sva,
						this.all_scopes.findIndex(
							(va_idx) =>
								va_idx &&
								va_idx.scope_path === `${reference.scope_path}.${reference.name}` &&
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

	public set_exception(exception: boolean) {
		this.exception = true;
	}

	public set_scopes(stackVars: GodotStackVars) {
		this.all_scopes = [
			undefined,
			{
				name: "local",
				value: undefined,
				sub_values: stackVars.locals,
				scope_path: "@"
			},
			{
				name: "member",
				value: undefined,
				sub_values: stackVars.members,
				scope_path: "@",
			},
			{
				name: "global",
				value: undefined,
				sub_values: stackVars.globals,
				scope_path: "@",
			},
		];

		stackVars.locals.forEach((va) => {
			va.scope_path = "@.local";
			this.append_variable(va);
		});

		stackVars.members.forEach((va) => {
			va.scope_path = "@.member";
			this.append_variable(va);
		});

		stackVars.globals.forEach((va) => {
			va.scope_path = "@.global";
			this.append_variable(va);
		});

		this.add_to_inspections();

		if (this.ongoing_inspections.length === 0) {
			this.previous_inspections = [];
			this.got_scope.notify();
		}
	}

	public set_inspection(id: bigint, replacement: GodotVariable) {
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

		// this.add_to_inspections();

		if (this.ongoing_inspections.length === 0) {
			this.previous_inspections = [];
			this.got_scope.notify();
		}
	}

	private add_to_inspections() {
		this.all_scopes.forEach((va) => {
			if (va && va.value instanceof ObjectId) {
				if (
					!this.ongoing_inspections.includes(va.value.id) &&
					!this.previous_inspections.includes(va.value.id)
				) {
					this.controller.request_inspect_object(va.value.id);
					this.ongoing_inspections.push(va.value.id);
				}
			}
		});
	}

	protected get_variable(expression: string, root: GodotVariable = null, index: number = 0, object_id: number = null): { variable: GodotVariable, index: number, object_id: number, error: string } {
		var result: { variable: GodotVariable, index: number, object_id: number, error: string } = { variable: null, index: null, object_id: null, error: null };

		if (!root) {
			if (!expression.includes("self")) {
				expression = "self." + expression;
			}

			root = this.all_scopes.find(x => x && x.name == "self");
			object_id = this.all_scopes.find(x => x && x.name == "id" && x.scope_path == "@.member.self").value;
		}

		var items = expression.split(".");
		var propertyName = items[index + 1];
		var path = items.slice(0, index + 1).join(".")
			.split("self.").join("")
			.split("self").join("")
			.split("[").join(".")
			.split("]").join("");

		if (items.length == 1 && items[0] == "self") {
			propertyName = "self";
		}

		// Detect index/key
		var key = (propertyName.match(/(?<=\[).*(?=\])/) || [null])[0];
		if (key) {
			key = key.replace(/['"]+/g, "");
			propertyName = propertyName.split(/(?<=\[).*(?=\])/).join("").split("\[\]").join("");
			if (path) path += ".";
			path += propertyName;
			propertyName = key;
		}

		function sanitizeName(name: string) {
			return name.split("Members/").join("").split("Locals/").join("");
		}

		function sanitizeScopePath(scope_path: string) {
			return scope_path.split("@.member.self.").join("")
				.split("@.member.self").join("")
				.split("@.member.").join("")
				.split("@.member").join("")
				.split("@.local.").join("")
				.split("@.local").join("")
				.split("Locals/").join("")
				.split("Members/").join("")
				.split("@").join("");
		}

		var sanitized_all_scopes = this.all_scopes.filter(x => x).map(function (x) {
			return {
				sanitized: {
					name: sanitizeName(x.name),
					scope_path: sanitizeScopePath(x.scope_path)
				},
				real: x
			};
		});

		result.variable = sanitized_all_scopes
			.find(x => x.sanitized.name == propertyName && x.sanitized.scope_path == path)
			?.real;
		if (!result.variable) {
			result.error = `Could not find: ${propertyName}`;
			return result;
		}

		if (root.value.entries) {
			if (result.variable.name == "self") {
				result.object_id = this.all_scopes
					.find(x => x && x.name == "id" && x.scope_path == "@.member.self").value;
			} else if (key) {
				var collection = path.split(".")[path.split(".").length - 1];
				var collection_items = Array.from(root.value.entries())
					.find(x => x && x[0].split("Members/").join("").split("Locals/").join("") == collection)[1];
				result.object_id = collection_items.get
					? collection_items.get(key)?.id
					: collection_items[key]?.id;
			} else {
				const entries = Array.from(root.value.entries());
				const item = entries.find(x => x && x[0].split("Members/").join("").split("Locals/").join("") == propertyName);
				result.object_id = item?.[1].id;
			}
		}

		if (!result.object_id) {
			result.object_id = object_id;
		}

		result.index = this.all_scopes.findIndex(x => x && x.name == result.variable.name && x.scope_path == result.variable.scope_path);

		if (items.length > 2 && index < items.length - 2) {
			result = this.get_variable(items.join("."), result.variable, index + 1, result.object_id);
		}

		return result;
	}

	private append_variable(variable: GodotVariable, index?: number) {
		if (index) {
			this.all_scopes.splice(index, 0, variable);
		} else {
			this.all_scopes.push(variable);
		}
		const base_path = `${variable.scope_path}.${variable.name}`;
		if (variable.sub_values) {
			variable.sub_values.forEach((va, i) => {
				va.scope_path = base_path;
				this.append_variable(va, index ? index + i + 1 : undefined);
			});
		}
	}
}
