export default function stringify(
	var_value: any,
	decimal_precision: number = 4
) {
	let type = "";
	let value = "";
	let skip_id = true;
	if (typeof var_value === "number" && !Number.isInteger(var_value)) {
		value = String(
			+Number.parseFloat(no_exponents(var_value)).toFixed(decimal_precision)
		);
		type = "Float";
	} else if (Array.isArray(var_value)) {
		value = "Array";
		type = "Array";
		skip_id = false;
	} else if (var_value instanceof Map) {
		value = "Dictionary";
		type = "Dictionary";
		skip_id = false;
	} else if (typeof var_value === "object") {
		skip_id = false;
		if (var_value.__type__) {
			if (var_value.__type__ === "Object") {
				skip_id = true;
			}
			if (var_value.__render__) {
				value = var_value.__render__();
			} else {
				value = var_value.__type__;
			}
			type = var_value.__type__;
		} else {
			value = "Object";
		}
	} else {
		if (var_value) {
			if (Number.isInteger(var_value)) {
				type = "Int";
				value = `${var_value}`;
			} else if (typeof var_value === "string") {
				type = "String";
				value = String(var_value);
			} else if (typeof var_value === "boolean") {
				type = "Bool";
				value = "true";
			} else {
				type = "unknown";
				value = `${var_value}`;
			}
		} else {
			if (Number.isInteger(var_value)) {
				type = "Int";
				value = "0";
			} else if (typeof var_value === "boolean") {
				type = "Bool";
				value = "false";
			} else {
				type = "unknown";
				value = "null";
			}
		}
	}

	return { type: type, value: value, skip_id: skip_id };
}

function no_exponents(value: number): string {
	let data = String(value).split(/[eE]/);
	if (data.length === 1) {
		return data[0];
	}

	let z = "",
		sign = value < 0 ? "-" : "";
	let str = data[0].replace(".", "");
	let mag = Number(data[1]) + 1;

	if (mag < 0) {
		z = sign + "0.";
		while (mag++) {
			z += "0";
		}
		return z + str.replace(/^\-/, "");
	}
	mag -= str.length;
	while (mag--) {
		z += 0;
	}
	return str + z;
}
