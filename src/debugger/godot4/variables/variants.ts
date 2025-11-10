import { GodotVariable } from "../../debug_runtime";
import { GodotObject } from "./godot_object_promise";
import { VariablesManager } from "./variables_manager";

export enum GDScriptTypes {
	NIL = 0,

	// atomic types
	BOOL = 1,
	INT = 2,
	FLOAT = 3,
	STRING = 4,

	// math types
	VECTOR2 = 5,
	VECTOR2I = 6,
	RECT2 = 7,
	RECT2I = 8,
	VECTOR3 = 9,
	VECTOR3I = 10,
	TRANSFORM2D = 11,
	VECTOR4 = 12,
	VECTOR4I = 13,
	PLANE = 14,
	QUATERNION = 15,
	AABB = 16,
	BASIS = 17,
	TRANSFORM3D = 18,
	PROJECTION = 19,

	// misc types
	COLOR = 20,
	STRING_NAME = 21,
	NODE_PATH = 22,
	RID = 23,
	OBJECT = 24,
	CALLABLE = 25,
	SIGNAL = 26,
	DICTIONARY = 27,
	ARRAY = 28,

	// typed arrays
	PACKED_BYTE_ARRAY = 29,
	PACKED_INT32_ARRAY = 30,
	PACKED_INT64_ARRAY = 31,
	PACKED_FLOAT32_ARRAY = 32,
	PACKED_FLOAT64_ARRAY = 33,
	PACKED_STRING_ARRAY = 34,
	PACKED_VECTOR2_ARRAY = 35,
	PACKED_VECTOR3_ARRAY = 36,
	PACKED_COLOR_ARRAY = 37,
	PACKED_VECTOR4_ARRAY = 38,

	VARIANT_MAX = 39
}

export const ENCODE_FLAG_64 = 1 << 16;
export const ENCODE_FLAG_OBJECT_AS_ID = 1 << 16;
export const ENCODE_FLAG_TYPED_ARRAY_MASK = 0b11 << 16;
export const ENCODE_FLAG_TYPED_DICT_MASK = 0b1111 << 16;

export enum ContainerTypeFlags {
	NONE = 0,
	BUILTIN = 1,
	CLASS_NAME = 2,
	SCRIPT = 3,
}

export interface BufferModel {
	buffer: Buffer;
	len: number;
	offset: number;
}

export interface GDObject {
	stringify_value(): string;
	sub_values(): GodotVariable[];
	type_name(): string;
}

function clean_number(value: number) {
	return +Number.parseFloat(String(value)).toFixed(1);
}

export class Vector3 implements GDObject {
	constructor(
		public x = 0.0,
		public y = 0.0,
		public z = 0.0
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
		];
	}

	public type_name(): string {
		return "Vector3";
	}
}

export class Vector3i extends Vector3 {
	// TODO: Truncate values in sub_values and stringify_value
	public type_name(): string {
		return "Vector3i";
	}
}

export class Vector4 implements GDObject {
	constructor(
		public x = 0.0,
		public y = 0.0,
		public z = 0.0,
		public w = 0.0
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${
			clean_number(this.z)}, ${clean_number(this.w)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "w", value: this.w },
		];
	}

	public type_name(): string {
		return "Vector4";
	}
}

export class Vector4i extends Vector4 {
	// TODO: Truncate values in sub_values and stringify_value
	public type_name(): string {
		return "Vector4i";
	}
}

export class Vector2 implements GDObject {
	constructor(public x = 0.0, public y = 0.0) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
		];
	}

	public type_name(): string {
		return "Vector2";
	}
}

export class Vector2i extends Vector2 {
	// TODO: Truncate values in sub_values and stringify_value
	public type_name(): string {
		return "Vector2i";
	}
}

export class Basis implements GDObject {
	constructor(public x: Vector3, public y: Vector3, public z: Vector3) {}

	public stringify_value(): string {
		return `(${this.x.stringify_value()}, ${this.y.stringify_value()}, ${this.z.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
		];
	}

	public type_name(): string {
		return "Basis";
	}
}

export class AABB implements GDObject {
	constructor(public position: Vector3, public size: Vector3) {}

	public stringify_value(): string {
		return `(${this.position.stringify_value()}, ${this.size.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "position", value: this.position },
			{ name: "size", value: this.size },
		];
	}

	public type_name(): string {
		return "AABB";
	}
}

export class Color implements GDObject {
	constructor(
		public r: number,
		public g: number,
		public b: number,
		public a = 1.0
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.r)}, ${clean_number(this.g)}, ${clean_number(
			this.b
		)}, ${clean_number(this.a)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "r", value: this.r },
			{ name: "g", value: this.g },
			{ name: "b", value: this.b },
			{ name: "a", value: this.a },
		];
	}

	public type_name(): string {
		return "Color";
	}
}

export class NodePath implements GDObject {
	constructor(
		public names: string[],
		public sub_names: string[],
		public absolute: boolean
	) {}

	public stringify_value(): string {
		return `(/${this.names.join("/")}${
			this.sub_names.length > 0 ? ":" : ""
		}${this.sub_names.join(":")})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "names", value: this.names },
			{ name: "sub_names", value: this.sub_names },
			{ name: "absolute", value: this.absolute },
		];
	}

	public type_name(): string {
		return "NodePath";
	}
}

export class RawObject extends Map<any, any> {
	constructor(public class_name: string) {
		super();
	}
}

export class ObjectId implements GDObject {
	constructor(public id: bigint) {}

	public stringify_value(): string {
		return `<${this.id}>`;
	}

	public async get_rendered_value(variables_manager: VariablesManager): Promise<string> {
		const godot_object: GodotObject = await variables_manager.get_godot_object(this.id);
		const __repr__ = godot_object.sub_values.find((sv) => sv.name === "__repr__");
		const rendered_value = __repr__ !== undefined ? __repr__.value : `${godot_object.type}${this.stringify_value()}`;
		return rendered_value;
	}

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "ObjectId";
	}
}

export class RID extends ObjectId {
	public type_name(): string {
		return "RID";
	}
}

export class Plane implements GDObject {
	constructor(
		public x: number,
		public y: number,
		public z: number,
		public d: number
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)}, ${clean_number(this.d)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "d", value: this.d },
		];
	}

	public type_name(): string {
		return "Plane";
	}
}

export class Quat implements GDObject {
	constructor(
		public x: number,
		public y: number,
		public z: number,
		public w: number
	) {}

	public stringify_value(): string {
		return `(${clean_number(this.x)}, ${clean_number(this.y)}, ${clean_number(
			this.z
		)}, ${clean_number(this.w)})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "w", value: this.w },
		];
	}

	public type_name(): string {
		return "Quat";
	}
}

export class Rect2 implements GDObject {
	constructor(public position: Vector2, public size: Vector2) {}

	public stringify_value(): string {
		return `(${this.position.stringify_value()} - ${this.size.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "position", value: this.position },
			{ name: "size", value: this.size },
		];
	}

	public type_name(): string {
		return "Rect2";
	}
}

export class Rect2i extends Rect2 {
	// TODO: Truncate values in sub_values and stringify_value
	public type_name(): string {
		return "Rect2i";
	}
}

export class Projection implements GDObject {
	constructor(public x: Vector4, public y: Vector4, public z: Vector4, public w: Vector4) {}

	public stringify_value(): string {
		return `(${this.x.stringify_value()}, ${this.y.stringify_value()}, ${this.z.stringify_value()}, ${this.w.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
			{ name: "z", value: this.z },
			{ name: "w", value: this.w },
		];
	}

	public type_name(): string {
		return "Projection";
	}
}

export class Transform3D implements GDObject {
	constructor(public basis: Basis, public origin: Vector3) {}

	public stringify_value(): string {
		return `(${this.basis.stringify_value()} - ${this.origin.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "basis", value: this.basis },
			{ name: "origin", value: this.origin },
		];
	}

	public type_name(): string {
		return "Transform";
	}
}

export class Transform2D implements GDObject {
	constructor(public origin: Vector2, public x: Vector2, public y: Vector2) {}

	public stringify_value(): string {
		return `(${this.origin.stringify_value()} - (${this.x.stringify_value()}, ${this.y.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "origin", value: this.origin },
			{ name: "x", value: this.x },
			{ name: "y", value: this.y },
		];
	}

	public type_name(): string {
		return "Transform2D";
	}
}

export class StringName implements GDObject {
	constructor(public value: string) {}

	public stringify_value(): string {
		return this.value;
	}

	public async get_rendered_value(variables_manager: VariablesManager): Promise<string> {
		const rendered_value = `&'${this.stringify_value()}'`;
		return rendered_value
	}

	public sub_values(): GodotVariable[] {
		return [
			{ name: "value", value: this.value },
		];
	}

	public type_name(): string {
		return "StringName";
	}
}

export class Callable implements GDObject {
	public stringify_value(): string {
		return "()";
	}

	public sub_values(): GodotVariable[] {
		return [];
	}

	public type_name(): string {
		return "Callable";
	}
}

export class Signal implements GDObject {
	constructor(public name: string, public oid: ObjectId) {}

	public stringify_value(): string {
		return `(${this.name}, ${this.oid.stringify_value()})`;
	}

	public sub_values(): GodotVariable[] {
		return undefined;
	}

	public type_name(): string {
		return "Signal";
	}
}
