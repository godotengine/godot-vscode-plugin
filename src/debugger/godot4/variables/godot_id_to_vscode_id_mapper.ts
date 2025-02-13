export class GodotIdWithPath {
  constructor(public godot_id: bigint, public path: string[] = []) {
  }

  toString(): string {
    return `${this.godot_id.toString()}:${this.path.join("/")}`;
  }
}

type GodotIdWithPathString = string;

export class GodotIdToVscodeIdMapper {
  // Maps `godot_id` to `vscode_id` and back.
  // Each `vscode_id` corresponds to expandable variable in vscode UI.
  // Each `godot_id` corresponds to object in godot server.
  // `vscode_id` maps 1:1 with [`godot_id`, path_to_variable_inside_godot_object].
  // For example, if godot_object with id 12345 looks like: { SomeDict: { SomeField: [1,2,3] } },
  //   then `vscode_id` for the 'SomeField' will map to [12345, ["SomeDict", "SomeField"]] in order to allow expansion of SomeField in the vscode UI.
  // Note: `vscode_id` is a number and `godot_id` is a bigint.
  
  private godot_to_vscode: Map<GodotIdWithPathString, number>; // use GodotIdWithPathString, since JS Map treats GodotIdWithPath only by reference
  private vscode_to_godot: Map<number, GodotIdWithPath>;
  private next_vscode_id: number;

  constructor() {
    this.godot_to_vscode = new Map<GodotIdWithPathString, number>();
    this.vscode_to_godot = new Map<number, GodotIdWithPath>();
    this.next_vscode_id = 1;
  }

  // Creates `vscode_id` for a given `godot_id` and path
  create_vscode_id(godot_id_with_path: GodotIdWithPath): number {
    const godot_id_with_path_str = godot_id_with_path.toString();
    if (this.godot_to_vscode.has(godot_id_with_path_str)) {
      throw new Error(`Duplicate godot_id: ${godot_id_with_path_str}`);
    }

    const vscode_id = this.next_vscode_id++;
    this.godot_to_vscode.set(godot_id_with_path_str, vscode_id);
    this.vscode_to_godot.set(vscode_id, godot_id_with_path);
    return vscode_id;
  }

  get_godot_id_with_path(vscode_id: number): GodotIdWithPath {
    const godot_id_with_path = this.vscode_to_godot.get(vscode_id);
    if (godot_id_with_path === undefined) {
      throw new Error(`Unknown vscode_id: ${vscode_id}`);
    }
    return godot_id_with_path;
  }

  get_vscode_id(godot_id_with_path: GodotIdWithPath, fail_if_not_found = true): number | undefined {
    const vscode_id = this.godot_to_vscode.get(godot_id_with_path.toString());
    if (fail_if_not_found && vscode_id === undefined) {
      throw new Error(`Unknown godot_id_with_path: ${godot_id_with_path}`);
    }
    return vscode_id;
  }

  get_or_create_vscode_id(godot_id_with_path: GodotIdWithPath): number {
    let vscode_id = this.get_vscode_id(godot_id_with_path, false);
    if (vscode_id === undefined) {
      vscode_id = this.create_vscode_id(godot_id_with_path);
    }
    return vscode_id;
  }
}