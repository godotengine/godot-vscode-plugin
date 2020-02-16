import { DebugProtocol } from "vscode-debugprotocol";

import { GodotDebugRuntime } from "./godot_debug_runtime";
import stringify from "./stringify";

export class VariableScopeBuilder {
	private inspect_callback: (() => void) | undefined;
	private inspected: number[] = [];
	private inspected_cache = new Map<
		number,
		{ class_name: string; properties: any[] }
	>();
	private over_scopes: DebugProtocol.Scope[];
	private scope_id = 1;
	private scopes = new Map<number, Map<string, VariableScope[]>>();

	constructor(
		private runtime: GodotDebugRuntime,
		private stack_level: number,
		private stack_files: string[],
		private raw_scopes: { locals: any[]; members: any[]; globals: any[] },
		private have_scopes: (() => void)[] = []
	) {}

	public get(level: number, file: string) {
		return this.scopes.get(level).get(file);
	}

	public get_keys(level: number) {
		return Array.from(this.scopes.get(level).keys());
	}

	public parse(callback: (over_scopes: DebugProtocol.Scope[]) => void) {
		let file = this.stack_files[this.stack_level];

		let file_scopes: VariableScope[] = [];

		let local_scope = new VariableScope(this.scope_id++);
		let member_scope = new VariableScope(this.scope_id++);
		let global_scope = new VariableScope(this.scope_id++);

		file_scopes.push(local_scope);
		file_scopes.push(member_scope);
		file_scopes.push(global_scope);

		this.scopes.set(
			this.stack_level,
			new Map<string, VariableScope[]>([[file, file_scopes]])
		);

		let out_local_scope: DebugProtocol.Scope = {
			name: "Locals",
			namedVariables: this.raw_scopes.locals.length / 2,
			presentationHint: "locals",
			expensive: false,
			variablesReference: local_scope.id
		};

		for (let i = 0; i < this.raw_scopes.locals.length; i += 2) {
			let name = this.raw_scopes.locals[i];
			let value = this.raw_scopes.locals[i + 1];

			this.drill_scope(
				local_scope,
				{
					name: name,
					value: value ? value : undefined
				},
				!value && typeof value === "number"
			);
		}

		let out_member_scope: DebugProtocol.Scope = {
			name: "Members",
			namedVariables: this.raw_scopes.members.length / 2,
			presentationHint: "locals",
			expensive: false,
			variablesReference: member_scope.id
		};

		for (let i = 0; i < this.raw_scopes.members.length; i += 2) {
			let name = this.raw_scopes.members[i];
			let value = this.raw_scopes.members[i + 1];

			this.drill_scope(
				member_scope,
				{ name: name, value: value },
				!value && typeof value === "number"
			);
		}

		let out_global_scope: DebugProtocol.Scope = {
			name: "Globals",
			namedVariables: this.raw_scopes.globals.length / 2,
			presentationHint: "locals",
			expensive: false,
			variablesReference: global_scope.id
		};

		for (let i = 0; i < this.raw_scopes.globals.length; i += 2) {
			let name = this.raw_scopes.globals[i];
			let value = this.raw_scopes.globals[i + 1];

			this.drill_scope(
				global_scope,
				{ name: name, value: value },
				!value && typeof value === "number"
			);
		}

		this.over_scopes = [out_local_scope, out_member_scope, out_global_scope];

		if (this.inspected.length === 0) {
			while (this.have_scopes.length > 0) {
				this.have_scopes.shift()();
			}
			callback(this.over_scopes);
		} else {
			this.inspect_callback = () => {
				while (this.have_scopes.length > 0) {
					this.have_scopes.shift()();
				}
				callback(this.over_scopes);
			};
		}
	}

	public size() {
		return this.scopes.size;
	}

	private drill_scope(
		scope: VariableScope,
		variable: any,
		is_zero_number?: boolean
	) {
		if (is_zero_number) {
			variable.value = 0;
		}
		let id = scope.get_id_for(variable.name);
		if (id === -1) {
			id = this.scope_id++;
		}
		scope.set_variable(variable.name, variable.value, id);
		if (Array.isArray(variable.value) || variable.value instanceof Map) {
			let length = 0;
			let values: any[];
			if (variable.value instanceof Map) {
				length = variable.value.size;
				let keys = Array.from(variable.value.keys());
				values = keys.map(key => {
					let value = variable.value.get(key);
					let stringified_key = stringify(key).value;

					return {
						__type__: "Pair",
						key: key,
						value: value,
						__render__: () => stringified_key
					};
				});
				variable.value = values;
			} else {
				length = variable.value.length;
				values = variable.value;
			}
			for (let i = 0; i < length; i++) {
				let name = `${variable.name}.${i}`;
				scope.set_sub_variable_for(id, name, values[i]);
				this.drill_scope(scope, {
					name: name,
					value: values[i]
				});
			}
		} else if (typeof variable.value === "object") {
			if (variable.value.__type__ && variable.value.__type__ === "Object") {
				if (!this.inspected_cache.has(id)) {
					if (this.inspected.indexOf(id) === -1) {
						this.inspected.push(id);
						this.runtime.inspect_object(
							variable.value.id,
							(class_name, properties) => {
								this.inspected_cache.set(id, {
									class_name: class_name,
									properties: properties
								});
								this.parse_deeper(variable, scope, id, class_name, properties);
							}
						);
					}
				} else {
					let cached = this.inspected_cache.get(id);
					this.parse_deeper(
						variable,
						scope,
						id,
						cached.class_name,
						cached.properties
					);
				}
			} else {
				for (const PROP in variable.value) {
					if (PROP !== "__type__" && PROP !== "__render__") {
						let name = `${variable.name}.${PROP}`;
						scope.set_sub_variable_for(id, name, variable.value[PROP]);
						this.drill_scope(scope, {
							name: name,
							value: variable.value[PROP]
						});
					}
				}
			}
		}
	}

	private parse_deeper(
		variable: any,
		scope: VariableScope,
		id: number,
		class_name: string,
		properties: any[][]
	) {
		variable.value.__type__ = class_name;
		let start_index = 0;
		variable.value.__render__ = () => `${class_name}`;
		let relevant_properties = properties.slice(start_index + 1).filter(p => {
			if (!p[5]) {
				return Number.isInteger(p[5]);
			}

			return true;
		});
		relevant_properties.forEach(p => {
			let sub_name = `${variable.name}.${p[0]}`;
			scope.set_sub_variable_for(id, sub_name, p[5]);
			this.drill_scope(scope, { name: sub_name, value: p[5] });
		});

		let inspected_idx = this.inspected.indexOf(variable.value.id);
		if (inspected_idx !== -1) {
			this.inspected.splice(inspected_idx, 1);
		}

		if (this.inspected.length === 0 && this.inspect_callback) {
			this.inspect_callback();
		}
	}
}

export class VariableScope {
	private sub_variables = new Map<number, { name: string; value: any }[]>();
	private variables = new Map<number, { name: string; value: any }>();

	public readonly id: number;

	constructor(id: number) {
		this.id = id;
	}

	public get_id_for(name: string) {
		let ids = Array.from(this.variables.keys());
		return (
			ids.find(v => {
				let var_name = this.variables.get(v).name;
				return var_name === name;
			}) || -1
		);
	}

	public get_sub_variable_for(name: string, id: number) {
		let sub_variables = this.sub_variables.get(id);
		if (sub_variables) {
			let index = sub_variables.findIndex(sv => {
				return sv.name === name;
			});
			if (index !== -1) {
				return sub_variables[index];
			}
		}

		return undefined;
	}

	public get_sub_variables_for(id: number) {
		return this.sub_variables.get(id);
	}

	public get_variable(id: number): { name: string; value: any } | undefined {
		return this.variables.get(id);
	}

	public get_variable_ids() {
		return Array.from(this.variables.keys());
	}

	public set_sub_variable_for(variable_id: number, name: string, value: any) {
		let sub_variables = this.sub_variables.get(variable_id);
		if (!sub_variables) {
			sub_variables = [];
			this.sub_variables.set(variable_id, sub_variables);
		}

		let index = sub_variables.findIndex(sv => {
			return sv.name === name;
		});

		if (index === -1) {
			sub_variables.push({ name: name, value: value });
		}
	}

	public set_variable(name: string, value: any, id: number) {
		let variable = { name: name, value: value };
		this.variables.set(id, variable);
	}
}
