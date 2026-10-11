import * as fs from "node:fs";
import { Breakpoint, InitializedEvent, LoggingDebugSession, Source, StoppedEvent, TerminatedEvent, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { Subject } from "await-notify";
import { GodotDebugData, GodotVariable } from "../debug_runtime";
import { AttachRequestArguments, LaunchRequestArguments } from "../debugger";
import { InspectorProvider } from "../inspector_provider";
import { stopPresentationV2 } from "./session_state_v2";
import { SceneTreeProvider } from "../scene_tree_provider";
import { ServerController } from "./server_controller_v2";
import { RawObject } from "./variables/variants";

export class GodotDebugSessionV2 extends LoggingDebugSession {
	public controller = new ServerController(this);
	public debug_data = new GodotDebugData(this);
	public sceneTree: SceneTreeProvider;
	public inspector: InspectorProvider;
	public inspect_callbacks = new Map<bigint, (className: string, variable: GodotVariable) => void>();
	private configurationDone = new Subject();
	private mode: "launch" | "attach" | "" = "";
	private nextReference = 1;
	private referenceToHandle = new Map<number, bigint>();
	private handleToReference = new Map<bigint, number>();
	private requestCancellations = new Map<number, AbortController>();

	public constructor() {
		super();
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	public dispose() { this.controller.stop(); }

	protected initializeRequest(response: DebugProtocol.InitializeResponse) {
		response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsTerminateRequest = true;
		response.body.supportsEvaluateForHovers = false;
		response.body.supportsStepBack = false;
		response.body.supportsFunctionBreakpoints = false;
		response.body.supportsConditionalBreakpoints = false;
		response.body.supportsCancelRequest = true;
		(response.body as any).supportsVariablePaging = true;
		this.sendResponse(response);
		this.sendEvent(new InitializedEvent());
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
		await this.configurationDone.wait(1000);
		this.mode = "launch";
		this.debug_data.projectPath = args.project;
		try { await this.controller.launch(args); this.sendResponse(response); } catch (error) { this.fail(response, error); }
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments) {
		await this.configurationDone.wait(1000);
		this.mode = "attach";
		try { await this.controller.attach(args); this.sendResponse(response); } catch (error) { this.fail(response, error); }
	}

	public configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse) {
		this.configurationDone.notify();
		this.sendResponse(response);
	}

	public onStopped(_stopId: bigint, _canContinue: boolean, error: string, isError: boolean) {
		this.nextReference = 1;
		this.referenceToHandle.clear();
		this.handleToReference.clear();
		const presentation = stopPresentationV2(error, isError);
		this.sendEvent(new StoppedEvent(presentation.reason, 0, presentation.text));
	}

	protected async continueRequest(response: DebugProtocol.ContinueResponse) {
		response.body = { allThreadsContinued: true };
		await this.execution(response, () => this.controller.continue());
	}
	protected async nextRequest(response: DebugProtocol.NextResponse) { await this.execution(response, () => this.controller.next()); }
	protected async pauseRequest(response: DebugProtocol.PauseResponse) { await this.execution(response, () => this.controller.break()); }
	protected async stepInRequest(response: DebugProtocol.StepInResponse) { await this.execution(response, () => this.controller.step()); }
	protected async stepOutRequest(response: DebugProtocol.StepOutResponse) { await this.execution(response, () => this.controller.step_out()); }

	private async execution(response: DebugProtocol.Response, action: () => Promise<number>) {
		try {
			const latency = await action();
			response.message = `Godot acknowledged in ${latency.toFixed(1)} ms`;
			this.sendResponse(response);
		} catch (error) { this.fail(response, error); }
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
		const cancellation = this.beginCancellable(response);
		try {
			const payload = await this.controller.request_stack_trace(args.startFrame ?? 0, args.levels ?? 100, cancellation.signal);
			const frames = Array.isArray(payload[1]) ? payload[1] : [];
			response.body = {
				totalFrames: Number(payload[0] ?? 0),
				stackFrames: frames.map((frame: any[]) => ({
					id: Number(frame[0]), name: String(frame[3]), line: Number(frame[2]), column: 1,
					source: new Source(String(frame[1]), `${this.debug_data.projectPath}/${String(frame[1]).replace("res://", "")}`),
				})),
			};
			this.sendResponse(response);
		} catch (error) { this.fail(response, error); } finally { this.requestCancellations.delete(response.request_seq); }
	}

	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		const cancellation = this.beginCancellable(response);
		try {
			const payload = await this.controller.request_scopes(args.frameId, cancellation.signal);
			const scopes = Array.isArray(payload[0]) ? payload[0] : [];
			response.body = { scopes: scopes.map((scope: any[]) => ({ name: String(scope[0]), variablesReference: this.reference(BigInt(scope[1])), expensive: Boolean(scope[2]) })) };
			this.sendResponse(response);
		} catch (error) { this.fail(response, error); } finally { this.requestCancellations.delete(response.request_seq); }
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
		const handle = this.referenceToHandle.get(args.variablesReference);
		if (handle === undefined) { response.body = { variables: [] }; this.sendResponse(response); return; }
		const cancellation = this.beginCancellable(response);
		try {
			const payload = await this.controller.request_variables(handle, args.start ?? 0, args.count ?? 100, cancellation.signal);
			const items = Array.isArray(payload[2]) ? payload[2] : [];
			response.body = { variables: items.map((item: any[]) => this.variable(item)) };
			this.sendResponse(response);
		} catch (error) { this.fail(response, error); } finally { this.requestCancellations.delete(response.request_seq); }
	}

	protected cancelRequest(response: DebugProtocol.CancelResponse, args: DebugProtocol.CancelArguments) {
		if (args.requestId !== undefined) this.requestCancellations.get(args.requestId)?.abort();
		this.sendResponse(response);
	}

	private beginCancellable(response: DebugProtocol.Response) {
		const cancellation = new AbortController();
		this.requestCancellations.set(response.request_seq, cancellation);
		return cancellation;
	}

	private variable(item: any[]): DebugProtocol.Variable {
		const handle = BigInt(item[3]);
		const indexed = Number(item[4]);
		const named = Number(item[5]);
		return {
			name: String(item[0]), type: String(item[1]), value: String(item[2]),
			variablesReference: handle === 0n ? 0 : this.reference(handle),
			indexedVariables: indexed || undefined, namedVariables: named || undefined,
		};
	}

	private reference(handle: bigint) {
		const existing = this.handleToReference.get(handle);
		if (existing !== undefined) return existing;
		const reference = this.nextReference++;
		this.handleToReference.set(handle, reference);
		this.referenceToHandle.set(reference, handle);
		return reference;
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
		const path = args.source.path?.replace(/\\/g, "/");
		if (!path || !fs.existsSync(path)) { response.body = { breakpoints: [] }; this.sendResponse(response); return; }
		const requested = args.lines || [];
		for (const breakpoint of this.debug_data.get_breakpoints(path)) if (!requested.includes(breakpoint.line)) this.debug_data.remove_breakpoint(path, breakpoint.line);
		const existing = this.debug_data.get_breakpoints(path).map((breakpoint) => breakpoint.line);
		for (const line of requested) {
			const item = args.breakpoints?.find((breakpoint) => breakpoint.line === line);
			if (!existing.includes(line) && !item?.condition) this.debug_data.set_breakpoint(path, line);
		}
		const breakpoints = this.debug_data.get_breakpoints(path).sort((a, b) => a.line - b.line);
		response.body = { breakpoints: breakpoints.map((breakpoint) => new Breakpoint(true, breakpoint.line, 1, new Source(breakpoint.file.split("/").pop() || "", breakpoint.file))) };
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse) { response.body = { threads: [new Thread(0, "Main Thread")] }; this.sendResponse(response); }
	protected evaluateRequest(response: DebugProtocol.EvaluateResponse) {
		response.success = false;
		response.message = "Evaluation is disabled in protocol v2; expand the required scope lazily.";
		response.body = { result: "null", variablesReference: 0 };
		this.sendResponse(response);
	}
	protected terminateRequest(response: DebugProtocol.TerminateResponse) {
		if (this.mode === "launch") { this.controller.stop(); this.sendEvent(new TerminatedEvent()); }
		this.sendResponse(response);
	}

	public acceptInspection(objectId: bigint, payload: any[]) {
		const id = BigInt(payload[0] ?? objectId);
		const className = String(payload[1] ?? "Object");
		const properties = Array.isArray(payload[2]) ? payload[2] : [];
		const object = new RawObject(className);
		for (const property of properties) if (Array.isArray(property) && property.length >= 6) object.set(property[0], property[5]);
		const variable: GodotVariable = { name: "", value: object };
		variable.sub_values = [...object.entries()].map(([name, value]) => ({ name: String(name), value }));
		this.inspect_callbacks.get(id)?.(className, variable);
		this.inspect_callbacks.delete(id);
	}

	private fail(response: DebugProtocol.Response, error: unknown) {
		response.success = false;
		response.message = error instanceof Error ? error.message : String(error);
		this.sendResponse(response);
	}
}
