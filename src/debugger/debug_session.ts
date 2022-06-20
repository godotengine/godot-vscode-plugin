import {
	LoggingDebugSession,
	InitializedEvent,
	Thread,
	Source,
	Breakpoint,
	StackFrame,
	Scope,
	Variable,
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { Mediator } from "./mediator";
import { GodotDebugData, GodotVariable } from "./debug_runtime";
import { ObjectId, RawObject } from "./variables/variants";
import { ServerController } from "./server_controller";
const { Subject } = require("await-notify");
import fs = require("fs");
import { SceneTreeProvider } from "./scene_tree/scene_tree_provider";
import { get_configuration } from "../utils";
import { debug } from "vscode";

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

	public dispose() { }

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
		this.sendResponse(response);
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

	// Fills the all_scopes variable
	protected async getVariables(): Promise<{ locals: Variable[], members: Variable[], globals: Variable[], all: Variable[] }> {

		var results = [];

		var stackTrace: { stackFrames: StackFrame[], totalFrames?: number } = await debug.activeDebugSession.customRequest("stackTrace")
		for (let f = 0; f < stackTrace.stackFrames.length; f++) {
			const stackFrame = stackTrace.stackFrames[f];
			var scopes: { scopes: Scope[] } = await debug.activeDebugSession.customRequest("scopes", { frameId: stackFrame.id });

			for (let s = 0; s < scopes.scopes.length; s++) {
				const scope = scopes.scopes[s];
				results.push((await debug.activeDebugSession.customRequest("variables", { variablesReference: scope.variablesReference })).variables);
			}
		}

		return { locals: results[0], members: results[1], globals: results[2], all: results[0].concat(results[1]).concat(results[2]) };
	}

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments
	) {
		var requestType = "inspect";

		if (["+", "-", "*", "/", ">", "<", "%", "!", "="].some(m => args.expression.includes(m))) {
			requestType = "math";
		}

		if (args.expression.split("").filter(x => x == "=").length == 1 && !args.expression.includes("!") && !args.expression.includes("<") && !args.expression.includes(">")) {
			requestType = "set";
		}

		if (args.expression.includes("()")) {
			requestType = "invoke";
		}

		if (requestType == "inspect") {
			this.evaluateInspect(response, args);
		}
		else if (requestType == "math") {
			this.evaluateMath(response, args);
		}
		else if (requestType == "set") {
			this.evaluateSet(response, args);
		}
		else if (requestType == "invoke") {
			response.body = {
				result: "Invoking functions is not implemented.",
				variablesReference: 0
			};
			this.sendResponse(response);
		}
	}
	
	protected getVariable(expression: string, root: GodotVariable = null, index: number = 0, object_id: number = null): { variable: GodotVariable, index: number, object_id: number } {
		
		var result: { variable: GodotVariable, index: number, object_id: number } = { variable: null, index: null, object_id: null };

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
		var key = (propertyName.match(/\[\w*]/) || [null])[0];
		if (key) {
			key = key.replace(/\D/g, '');
			propertyName = propertyName.split(/\[\w*]/).join("")
			path += "." + propertyName;
			propertyName = key;
		}


		function sanitizeName(name: string) {
			return name.split("Members/").join("").split("Locals/").join("");
		}

		function sanitizeScopePath(scope_path: string) {
			return scope_path.split("@.member.self").join("")
				.split("@.member.").join("")
				.split("@.local.").join("")
				.split("Members/").join("")
				.split("@.member").join("")
				.split("@.local").join("")
				.split("@").join("");
		}

		var sanitized_all_scopes = this.all_scopes.filter(x => x).map(function (x) {
			return {
				sanitized: {
					name: sanitizeName(x.name),
					scope_path: sanitizeScopePath(x.scope_path)
				},
				real: x
			}
		})

		result.variable = sanitized_all_scopes
			.find(x => x.sanitized.name == propertyName && x.sanitized.scope_path == path)
			?.real;
		if (root.value.entries) {
			if (result.variable.name == "self") {
				result.object_id = this.all_scopes
					.find(x => x && x.name == "id" && x.scope_path == "@.member.self").value;
			}
			else if (key) {
				var collection = path.split(".")[path.split(".").length - 1];
				result.object_id = Array.from(root.value.entries())
					.find(x => x && x[0].split("Members/").join("").split("Locals/").join("") == collection)[1][key].id;
			}
			else {
				result.object_id = Array.from(root.value.entries())
					.find(x => x && x[0].split("Members/").join("").split("Locals/").join("") == propertyName)[1].id;
			}
		}

		if (!result.object_id) {
			result.object_id = object_id;
		}

		result.index = this.all_scopes.findIndex(x => x && x.name == result.variable.name && x.scope_path == result.variable.scope_path);

		if (items.length > 2 && index < items.length - 2) {
			result = this.getVariable(items.join("."), result.variable, index + 1, result.object_id);
		}

		return result;
	}

	protected async evaluateInspect(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
		var v = await this.getVariables();

		if (this.all_scopes) {

			var variable = await this.getVariable(args.expression);

			if (variable != null) {
				response.body = {
					result: this.parse_variable(variable.variable).value,
					variablesReference: variable.index
				};
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

	protected isNumber(str: string): boolean {
		if (typeof str !== 'string') {
			return false;
		}

		if (str.trim() === '') {
			return false;
		}

		return !Number.isNaN(Number(str));
	}

	protected async evaluateMath(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {

		await this.getVariables();

		var placeholders = args.expression.split(/\*|\+|-|\/|\<\=|\<|\>\=|\>|\=\=|\!\=|\%/).filter((x: string) => !this.isNumber(x)).map(p => p.trim());

		if (placeholders.length > 0) {
			placeholders.forEach(async (p: string) => {
				var variable = await this.getVariable(p);
				if (variable) {
					args.expression = args.expression.split(p).join(variable.variable.value);
					// args.expression = args.expression.split(p).join(variable.value);
				}
				else {
					response.body = {
						result: `Could not find variable: ${p}`,
						variablesReference: 0
					}

					this.sendResponse(response);
					return;
				}
			});
		}

		var result = `${eval(args.expression)}`;

		response.body = {
			result: result,
			variablesReference: 0
		}

		this.sendResponse(response);
	}

	// protected async evaluateSet(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
	// 	await this.getVariables();

	// 	var path: string = args.expression.split("=")[0].trim();
	// 	var value: string = args.expression.split("=")[1].trim();

	// 	var variable = this.getVariable(path);

	// 	Mediator.notify("changed_value", [
	// 		variable.object_id,
	// 		variable.variable.name,
	// 		value,
	// 	]);

	// 	response.body = {
	// 		result: `${value}`,
	// 		variablesReference: 0
	// 	};

	// 	this.sendResponse(response);
	// 	// var variables = (await this.getVariables()).all;
	// 	// var segments: string[] = args.expression.split("=")[0].trim().split(".");
	// 	// var value: string = args.expression.split("=")[1].trim();
	// 	// var variable: Variable = null;

	// 	// for (let i = 0; i < segments.length; i++) {
	// 	// 	const segment = segments[i];
	// 	// 	variable = variables.find(v => v && v.name.split("Members/").join("") == segment);
	// 	// 	if (i >= segments.length - 1) break;
	// 	// 	variables = (await debug.activeDebugSession.customRequest("variables", { variablesReference: variable.variablesReference })).variables;
	// 	// }

	// 	// if (variable) {
	// 	// 	debug.activeDebugSession.customRequest(
	// 	// 		"setVariable",
	// 	// 		{
	// 	// 			name: variable.name,
	// 	// 			value: value
	// 	// 		}
	// 	// 	).then(
	// 	// 		(reply: {
	// 	// 			value: string,
	// 	// 			type?: string,
	// 	// 			variablesReference?: number,
	// 	// 			namedVariables?: number,
	// 	// 			indexedVariables?: number
	// 	// 		}) => {
	// 	// 			this.sendResponse(response);
	// 	// 		},
	// 	// 		(error: { message: string, name: string }) => {
	// 	// 			response.body = {
	// 	// 				result: error.message,
	// 	// 				variablesReference: 0,
	// 	// 			};

	// 	// 			this.sendResponse(response);
	// 	// 		}
	// 	// 	);
	// 	// }
	// }

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

		response.body.supportsSetExpression = true;
		response.body.supportsSetVariable = true;

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
			get_configuration("scene_file_config", "") || args.scene_file,
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
					let bp = args.breakpoints.find((bp_at_line) => (bp_at_line.line == l));
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

	protected setExpressionRequest(
		response: DebugProtocol.SetExpressionResponse,
		args: DebugProtocol.SetExpressionArguments,
		request?: DebugProtocol.Request
	): void {
		response.success = false;
		response.message = "Setting expressions is not implemented";

		this.sendResponse(response);
	}

	protected setVariableRequest(
		response: DebugProtocol.SetVariableResponse,
		args: DebugProtocol.SetVariableArguments,
		request?: DebugProtocol.Request
	): void {
		var object_id = this.all_scopes.find(x => x && x.name == "id" && x.scope_path == "@.member.self").value

		Mediator.notify("changed_value", [
			object_id,
			args.name,
			args.value,
		]);

		response.success = true;
		response.message = args.value;

		this.sendResponse(response);
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
