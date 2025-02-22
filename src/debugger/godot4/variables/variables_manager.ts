import { DebugProtocol } from "@vscode/debugprotocol";
import { ServerController } from "../server_controller";
import { GodotObject, GodotObjectPromise } from "./godot_object_promise";
import { GodotVariable } from "../../debug_runtime";
import { ObjectId } from "./variants";
import { GodotIdToVscodeIdMapper, GodotIdWithPath } from "./godot_id_to_vscode_id_mapper";

export interface VsCodeScopeIDs {
  Locals: number;
  Members: number;
  Globals: number;
}

export class VariablesManager {
  constructor(public controller: ServerController) {
  }
  
  public godot_object_promises: Map<bigint, GodotObjectPromise>= new Map();
	public godot_id_to_vscode_id_mapper = new GodotIdToVscodeIdMapper();
	
	// variablesFrameId: number;

  private frame_id_to_scopes_map: Map<number, VsCodeScopeIDs> = new Map();

  /**
   * Returns Locals, Members, and Globals vscode_ids
   * @param stack_frame_id the id of the stack frame
   * @returns an object with Locals, Members, and Globals vscode_ids
   */
  public get_or_create_frame_scopes(stack_frame_id: number): VsCodeScopeIDs {
    var scopes = this.frame_id_to_scopes_map.get(stack_frame_id);
    if (scopes === undefined) {
      const frame_id = BigInt(stack_frame_id);
      scopes = {} as VsCodeScopeIDs;
      scopes.Locals = this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(new GodotIdWithPath(-frame_id*3n-1n, []));
      scopes.Members = this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(new GodotIdWithPath(-frame_id*3n-2n, []));
      scopes.Globals = this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(new GodotIdWithPath(-frame_id*3n-3n, []));
      this.frame_id_to_scopes_map.set(stack_frame_id, scopes);
    }

    return scopes;
	}

  /**
   * Retrieves a Godot object from the cache or godot debug server
   * @param godot_id the id of the object
   * @returns a promise that resolves to the requested object
   */
  public async get_godot_object(godot_id: bigint, force_refresh = false) {
    if (force_refresh) {
      // delete the object
      this.godot_object_promises.delete(godot_id);

      // check if member scopes also need to be refreshed:
      for (const [stack_frame_id, scopes] of this.frame_id_to_scopes_map) {
        const members_godot_id = this.godot_id_to_vscode_id_mapper.get_godot_id_with_path(scopes.Members);
        const scopes_object = await this.get_godot_object(members_godot_id.godot_id);
        const self = scopes_object.sub_values.find((sv) => sv.name === "self");
        if (self !== undefined && self.value instanceof ObjectId) {
          if (self.value.id === godot_id) {
            this.godot_object_promises.delete(members_godot_id.godot_id); // force refresh the member scope
          }
        }
      }
    }
    var variable_promise = this.godot_object_promises.get(godot_id);
    if (variable_promise === undefined) {
      // variable not found, request one
      if (godot_id < 0) {
        // special case for scopes, which have godot_id below 0. see @this.get_or_create_frame_scopes
        // all 3 scopes for current stackFrameId are retrieved at the same time, aka [-1,-2-,3], [-4,-5,-6], etc..
        // init corresponding promises
        const requested_stack_frame_id = (-godot_id-1n)/3n;
        // this.variablesFrameId will be undefined when the debugger just stopped at breakpoint:
        // evaluateRequest is called before scopesRequest
        const local_scopes_godot_id = -requested_stack_frame_id*3n-1n;
        const member_scopes_godot_id = -requested_stack_frame_id*3n-2n;
        const global_scopes_godot_id = -requested_stack_frame_id*3n-3n;
        this.godot_object_promises.set(local_scopes_godot_id, new GodotObjectPromise());
        this.godot_object_promises.set(member_scopes_godot_id, new GodotObjectPromise());
        this.godot_object_promises.set(global_scopes_godot_id, new GodotObjectPromise());
        variable_promise = this.godot_object_promises.get(godot_id);
        // request stack vars from godot server, which will resolve variable promises 1,2 & 3
        // see file://../server_controller.ts 'case "stack_frame_vars":'
        this.controller.request_stack_frame_vars(Number(requested_stack_frame_id));
      } else {
        this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(new GodotIdWithPath(godot_id, []));
        variable_promise = new GodotObjectPromise();
        this.godot_object_promises.set(godot_id, variable_promise);
        // request the object from godot server. Once godot server responds, the controller will resolve the variable_promise
        this.controller.request_inspect_object(godot_id);
      }
    }
    const godot_object = await variable_promise.promise;

    return godot_object;
  }

  public async get_vscode_object(vscode_id: number): Promise<DebugProtocol.Variable[]> {
    const godot_id_with_path = this.godot_id_to_vscode_id_mapper.get_godot_id_with_path(vscode_id);
    if (godot_id_with_path === undefined) {
      throw new Error(`Unknown variablesReference ${vscode_id}`);
    }
    const godot_object = await this.get_godot_object(godot_id_with_path.godot_id);
    if (godot_object === undefined) {
      throw new Error(`Cannot retrieve path '${godot_id_with_path.toString()}'. Godot object with id ${godot_id_with_path.godot_id} not found.`);
    }

    let sub_values: GodotVariable[] = godot_object.sub_values;

    // if the path is specified, walk the godot_object using it to access the requested variable:
    for (const [idx, path] of godot_id_with_path.path.entries()) {
      const sub_val = sub_values.find((sv) => sv.name === path);
      if (sub_val === undefined) {
        throw new Error(`Cannot retrieve path '${godot_id_with_path.toString()}'. Following subpath not found: '${godot_id_with_path.path.slice(0, idx+1).join("/")}'.`);
      }
      sub_values = sub_val.sub_values;				
    }

    const variables: DebugProtocol.Variable[] = [];
    for (const va of sub_values) {
      const godot_id_with_path_sub = va.id !== undefined ? new GodotIdWithPath(va.id, []) : undefined;
      const vscode_id = godot_id_with_path_sub !== undefined ? this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(godot_id_with_path_sub) : 0;
      const variable: DebugProtocol.Variable = await this.parse_variable(va, vscode_id, godot_id_with_path.godot_id, godot_id_with_path.path, this.godot_id_to_vscode_id_mapper);
      variables.push(variable);
    }

    return variables;
  }

  public async get_vscode_variable_by_name(variable_name: string, stack_frame_id: number): Promise<DebugProtocol.Variable> {
    let variable: GodotVariable;

    const variable_names = variable_name.split(".");

    for (var i = 0; i < variable_names.length; i++) {
      if (i === 0) {
        // find the first part of variable_name in scopes. Locals first, then Members, then Globals
        const vscode_scope_ids = this.get_or_create_frame_scopes(stack_frame_id);
        const vscode_ids = [vscode_scope_ids.Locals, vscode_scope_ids.Members, vscode_scope_ids.Globals];
        const godot_ids = vscode_ids.map(vscode_id => this.godot_id_to_vscode_id_mapper.get_godot_id_with_path(vscode_id))
                                    .map(godot_id_with_path => godot_id_with_path.godot_id);
        for (var godot_id of godot_ids) {
          // check each scope for requested variable
          const scope = await this.get_godot_object(godot_id);
          variable = scope.sub_values.find((sv) => sv.name === variable_names[0]);
          if (variable !== undefined) {
            break;
          }
        }
      } else {
        // just look up the subpath using the current variable
        if (variable.value instanceof ObjectId) {
          const godot_object = await this.get_godot_object(variable.value.id);
          variable = godot_object.sub_values.find((sv) => sv.name === variable_names[i]);
        } else {
          variable = variable.sub_values.find((sv) => sv.name === variable_names[i]);
        }
      }
      if (variable === undefined) {
        throw new Error(`Cannot retrieve path '${variable_name}'. Following subpath not found: '${variable_names.slice(0, i+1).join(".")}'`);
      }
    }

    const parsed_variable = await this.parse_variable(variable, undefined, godot_id, [], this.godot_id_to_vscode_id_mapper);
    if (parsed_variable.variablesReference === undefined) {
      const objectId = variable.value instanceof ObjectId ? variable.value : undefined;
      const vscode_id = objectId !== undefined ? this.godot_id_to_vscode_id_mapper.get_or_create_vscode_id(new GodotIdWithPath(objectId.id, [])) : 0;
      parsed_variable.variablesReference = vscode_id;
    }

    return parsed_variable;
  }

  private async parse_variable(va: GodotVariable, vscode_id?: number, parent_godot_id?: bigint, relative_path?: string[], mapper?: GodotIdToVscodeIdMapper): Promise<DebugProtocol.Variable> {
    const value = va.value;
    let rendered_value = "";
    let reference = 0;
  
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
        rendered_value = `(${value.length}) [${value.slice(0, 10).join(", ")}]`;
        reference = mapper.get_or_create_vscode_id(new GodotIdWithPath(parent_godot_id, [...relative_path, va.name]));
      } else if (value instanceof Map) {
        rendered_value = value["class_name"] ?? `Dictionary(${value.size})`;
        reference = mapper.get_or_create_vscode_id(new GodotIdWithPath(parent_godot_id, [...relative_path, va.name]));
      } else if (value instanceof ObjectId) {
        if (value.id === undefined) {
          throw new Error("Invalid godot object: instanceof ObjectId but id is undefined");
        }
        // Godot returns only ID for the object.
        // In order to retrieve the class name, we need to request the object
        const godot_object = await this.get_godot_object(value.id);
        rendered_value = `${godot_object.type}${value.stringify_value()}`;
        // rendered_value = `${value.type_name()}${value.stringify_value()}`;
        reference = vscode_id;
      }
      else {
        try {
          rendered_value = `${value.type_name()}${value.stringify_value()}`;
        } catch (e) {
          rendered_value = `${value}`;
        }
        reference = mapper.get_or_create_vscode_id(new GodotIdWithPath(parent_godot_id, [...relative_path, va.name]));
        // reference = vsode_id ? vsode_id : 0;
      }
    }
  
    const variable: DebugProtocol.Variable = {
      name: va.name,
      value: rendered_value,
      variablesReference: reference
    };
    
    return variable;
  }  

  public resolve_variable(godot_id: bigint, className: string, sub_values: GodotVariable[]) {
    const variable_promise = this.godot_object_promises.get(godot_id);
    if (variable_promise === undefined) {
      throw new Error(`Received 'inspect_object' for godot_id ${godot_id} but no variable promise to resolve found`);
    }

    variable_promise.resolve({godot_id: godot_id, type: className, sub_values: sub_values} as GodotObject);
  }
}