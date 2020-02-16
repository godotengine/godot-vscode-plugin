export class VariableScope {
	private sub_variables = new Map<number, { name: string; value: any }[]>();
	private variables = new Map<number, { name: string; value: any }>();

	public readonly id: number;

	constructor(id: number) {
		this.id = id;
	}

	public get_id_for(name: string) {
		let ids = Array.from(this.variables.keys());
		return ids.find(v => {
			let var_name = this.variables.get(v).name;
			return var_name === name;
		}) || -1;
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
