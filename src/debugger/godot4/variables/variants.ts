import { GodotVariable } from "../../debug_runtime";

export enum GDScriptTypes {
	NIL,

	// atomic types
	BOOL,
	INT,
	FLOAT,
	STRING,

	// math types
	VECTOR2,
	VECTOR2I,
	RECT2,
	RECT2I,
	VECTOR3,
	VECTOR3I,
	TRANSFORM2D,
	VECTOR4,
	VECTOR4I,
	PLANE,
	QUATERNION,
	AABB,
	BASIS,
	TRANSFORM3D,
	PROJECTION,

	// misc types
	COLOR,
	STRING_NAME,
	NODE_PATH,
	RID,
	OBJECT,
	CALLABLE,
	SIGNAL,
	DICTIONARY,
	ARRAY,

	// typed arrays
	PACKED_BYTE_ARRAY,
	PACKED_INT32_ARRAY,
	PACKED_INT64_ARRAY,
	PACKED_FLOAT32_ARRAY,
	PACKED_FLOAT64_ARRAY,
	PACKED_STRING_ARRAY,
	PACKED_VECTOR2_ARRAY,
	PACKED_VECTOR3_ARRAY,
	PACKED_COLOR_ARRAY,
	PACKED_VECTOR4_ARRAY,

	VARIANT_MAX
}

export const ENCODE_FLAG_64 = 1 << 16;
export const ENCODE_FLAG_OBJECT_AS_ID = 1 << 16;
export const ENCODE_FLAG_TYPED_ARRAY = 1 << 16;

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
		public x: number = 0.0,
		public y: number = 0.0,
		public z: number = 0.0
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
		public x: number = 0.0,
		public y: number = 0.0,
		public z: number = 0.0,
		public w: number = 0.0
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
	constructor(public x: number = 0.0, public y: number = 0.0) {}

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
		public a: number = 1.0
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

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "Object";
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
		return `${this.name}() ${this.oid.stringify_value()}`;
	}

	public sub_values(): GodotVariable[] {
		return undefined;
	}

	public type_name(): string {
		return "Signal";
	}
}
