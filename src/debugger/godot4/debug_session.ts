import {
	Breakpoint,
	InitializedEvent,
	LoggingDebugSession,
	Source,
	TerminatedEvent,
	Thread,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { Subject } from "await-notify";
import * as fs from "node:fs";

import { createLogger } from "../../utils";
import { GodotDebugData } from "../debug_runtime";
import { AttachRequestArguments, LaunchRequestArguments } from "../debugger";
import { SceneTreeProvider } from "../scene_tree_provider";
import { ServerController } from "./server_controller";
import { VariablesManager } from "./variables/variables_manager";

const log = createLogger("debugger.session", { output: "Godot Debugger" });

export class GodotDebugSession extends LoggingDebugSession {
	public controller = new ServerController(this);
	public debug_data = new GodotDebugData(this);
	public sceneTree: SceneTreeProvider;
	private exception = false;
	private configuration_done: Subject = new Subject();
	private mode: "launch" | "attach" | "" = "";

	public variables_manager: VariablesManager;

	public constructor(projectVersion: string) {
		super();

		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		this.controller.setProjectVersion(projectVersion);
	}

	public dispose() {
		this.controller.stop();
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		args: DebugProtocol.InitializeRequestArguments,
	) {
		log.info("initializeRequest", args);
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

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
		log.info("launchRequest", args);
		await this.configuration_done.wait(1000);

		this.mode = "launch";

		this.debug_data.projectPath = args.project;
		this.exception = false;
		await this.controller.launch(args);

		this.sendResponse(response);
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments) {
		log.info("attachRequest", args);
		await this.configuration_done.wait(1000);

		this.mode = "attach";

		this.debug_data.projectPath = args.project;
		this.exception = false;
		await this.controller.attach(args);

		this.sendResponse(response);
	}

	public configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments,
	) {
		log.info("configurationDoneRequest", args);
		this.configuration_done.notify();
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
		log.info("continueRequest", args);
		if (!this.exception) {
			response.body = { allThreadsContinued: true };
			this.controller.continue();
			this.sendResponse(response);
		}
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
		log.info("nextRequest", args);
		if (!this.exception) {
			this.controller.next();
			this.sendResponse(response);
		}
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
		log.info("pauseRequest", args);
		if (!this.exception) {
			this.controller.break();
			this.sendResponse(response);
		}
	}

	protected setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
	) {
		log.info("setBreakPointsRequest", args);
		const path = (args.source.path as string).replace(/\\/g, "/");
		const client_lines = args.lines || [];

		if (fs.existsSync(path)) {
			let bps = this.debug_data.get_breakpoints(path);
			const bp_lines = bps.map((bp) => bp.line);

			for (const bp of bps) {
				if (client_lines.indexOf(bp.line) === -1) {
					this.debug_data.remove_breakpoint(path, bp.line);
				}
			}
			for (const l of client_lines) {
				if (bp_lines.indexOf(l) === -1) {
					const bp = args.breakpoints.find((bp_at_line) => bp_at_line.line === l);
					if (!bp.condition) {
						this.debug_data.set_breakpoint(path, l);
					}
				}
			}

			bps = this.debug_data.get_breakpoints(path);
			// Sort to ensure breakpoints aren't out-of-order, which would confuse VS Code.
			bps.sort((a, b) => (a.line < b.line ? -1 : 1));

			response.body = {
				breakpoints: bps.map((bp) => {
					return new Breakpoint(true, bp.line, 1, new Source(bp.file.split("/").reverse()[0], bp.file));
				}),
			};

			this.sendResponse(response);
		}
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
		log.info("stepInRequest", args);
		if (!this.exception) {
			this.controller.step();
			this.sendResponse(response);
		}
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
		log.info("stepOutRequest", args);
		if (!this.exception) {
			this.controller.step_out();
			this.sendResponse(response);
		}
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments) {
		log.info("terminateRequest", args);
		if (this.mode === "launch") {
			this.controller.stop();
			this.sendEvent(new TerminatedEvent());
		}
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse) {
		log.info("threadsRequest");
		response.body = { threads: [new Thread(0, "thread_1")] };
		log.info("threadsRequest response", response);
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
		log.info("stackTraceRequest", args);
		if (this.debug_data.last_frame) {
			response.body = {
				totalFrames: this.debug_data.last_frames.length,
				stackFrames: this.debug_data.last_frames.map((sf) => {
					return {
						id: sf.id,
						name: sf.function,
						line: sf.line,
						column: 1,
						source: new Source(sf.file, `${this.debug_data.projectPath}/${sf.file.replace("res://", "")}`),
					};
				}),
			};
		}

		log.info("stackTraceRequest response", response);
		this.sendResponse(response);
	}

	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		log.info("scopesRequest", args);
		// this.variables_manager.variablesFrameId = args.frameId;

		// TODO: create scopes dynamically for a given frame
		const vscode_scope_ids = this.variables_manager.get_or_create_frame_scopes(args.frameId);
		const scopes_with_references = [
			{ name: "Locals", variablesReference: vscode_scope_ids.Locals, expensive: false },
			{ name: "Members", variablesReference: vscode_scope_ids.Members, expensive: false },
			{ name: "Globals", variablesReference: vscode_scope_ids.Globals, expensive: false },
		];

		response.body = {
			scopes: scopes_with_references,
			// scopes: [
			// 	{ name: "Locals", variablesReference: 1, expensive: false },
			// 	{ name: "Members", variablesReference: 2, expensive: false },
			// 	{ name: "Globals", variablesReference: 3, expensive: false },
			// ],
		};

		log.info("scopesRequest response", response);
		this.sendResponse(response);
	}

	protected async variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments,
	) {
		log.info("variablesRequest", args);
		try {
			const variables = await this.variables_manager.get_vscode_object(args.variablesReference);

			response.body = {
				variables: variables,
			};
		} catch (error) {
			log.error("variablesRequest", error);
			response.success = false;
			response.message = error.toString();
		}

		log.info("variablesRequest response", response);
		this.sendResponse(response);
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
		log.info("evaluateRequest", args);

		try {
			const parsed_variable = await this.variables_manager.get_vscode_variable_by_name(
				args.expression,
				args.frameId,
			);
			response.body = {
				result: parsed_variable.value,
				variablesReference: parsed_variable.variablesReference,
			};
		} catch (error) {
			response.success = false;
			response.message = error.toString();
			response.body = {
				result: "null",
				variablesReference: 0,
			};
		}

		log.info("evaluateRequest response", response);
		this.sendResponse(response);
	}

	public set_exception(exception: boolean) {
		this.exception = true;
	}
}
