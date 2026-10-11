export type DebuggerMode = "godot3-legacy" | "godot3-v2" | "godot4-legacy" | "godot4-v2";

/** Project version selects the adapter; the protocol opt-in preserves stock-engine debugging. */
export function select_debugger_mode(projectVersion: string | undefined, protocolV2: unknown): DebuggerMode {
	const major = projectVersion?.startsWith("4") ? "godot4" : "godot3";
	return `${major}-${protocolV2 === true ? "v2" : "legacy"}`;
}
