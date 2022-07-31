import {
	GDScriptTypes,
	BufferModel,
	Vector3,
	Vector2,
	Basis,
	AABB,
	Color,
	Plane,
	Quat,
	Rect2,
	Transform3D,
	Transform2D,
	Vector3i,
	Vector2i,
	Rect2i,
	Vector4i,
	Vector4,
	StringName,
	Projection,
	ENCODE_FLAG_64,
} from "./variants";

export class VariantEncoder {
	public encode_variant(
		value:
			| number
			| bigint
			| boolean
			| string
			| Map<any, any>
			| Array<any>
			| object
			| undefined,
		model?: BufferModel
	) {
		if (
			typeof value === "number" &&
			Number.isInteger(value) &&
			(value > 2147483647 || value < -2147483648)
		) {
			value = BigInt(value);
		}

		if (!model) {
			let size = this.size_variant(value);
			let buffer = Buffer.alloc(size + 4);
			model = {
				buffer: buffer,
				offset: 0,
				len: 0,
			};
			this.encode_UInt32(size, model);
		}

		switch (typeof value) {
			case "number":
				{
					let is_integer = Number.isInteger(value);
					if (is_integer) {
						this.encode_UInt32(GDScriptTypes.INT, model);
						this.encode_UInt32(value, model);
					} else {
						this.encode_UInt32(GDScriptTypes.FLOAT, model);
						this.encode_Float32(value, model);
					}
				}
				break;
			case "bigint":
				this.encode_UInt32(GDScriptTypes.INT | ENCODE_FLAG_64, model);
				this.encode_UInt64(value, model);
				break;
			case "boolean":
				this.encode_UInt32(GDScriptTypes.BOOL, model);
				this.encode_Bool(value, model);
				break;
			case "string":
				this.encode_UInt32(GDScriptTypes.STRING, model);
				this.encode_String(value, model);
				break;
			case "undefined":
				break;
			default:
				if (Array.isArray(value)) {
					this.encode_UInt32(GDScriptTypes.ARRAY, model);
					this.encode_Array(value, model);
				} else if (value instanceof Map) {
					this.encode_UInt32(GDScriptTypes.DICTIONARY, model);
					this.encode_Dictionary(value, model);
				} else {
					if (value instanceof Vector2i) {
						this.encode_UInt32(GDScriptTypes.VECTOR2I, model);
						this.encode_Vector2i(value, model);
					} else if (value instanceof Vector2) {
						this.encode_UInt32(GDScriptTypes.VECTOR2, model);
						this.encode_Vector2(value, model);
					} else if (value instanceof Rect2i) {
						this.encode_UInt32(GDScriptTypes.RECT2I, model);
						this.encode_Rect2i(value, model);
					} else if (value instanceof Rect2) {
						this.encode_UInt32(GDScriptTypes.RECT2, model);
						this.encode_Rect2(value, model);
					} else if (value instanceof Vector3i) {
						this.encode_UInt32(GDScriptTypes.VECTOR3I, model);
						this.encode_Vector3i(value, model);
					} else if (value instanceof Vector3) {
						this.encode_UInt32(GDScriptTypes.VECTOR3, model);
						this.encode_Vector3(value, model);
					} else if (value instanceof Vector4i) {
						this.encode_UInt32(GDScriptTypes.VECTOR4I, model);
						this.encode_Vector4i(value, model);
					} else if (value instanceof Vector4) {
						this.encode_UInt32(GDScriptTypes.VECTOR4, model);
						this.encode_Vector4(value, model);
					} else if (value instanceof Transform2D) {
						this.encode_UInt32(GDScriptTypes.TRANSFORM2D, model);
						this.encode_Transform2D(value, model);
					} else if (value instanceof StringName) {
						this.encode_UInt32(GDScriptTypes.STRING_NAME, model);
						this.encode_StringName(value, model);
					} else if (value instanceof Plane) {
						this.encode_UInt32(GDScriptTypes.PLANE, model);
						this.encode_Plane(value, model);
					} else if (value instanceof Projection) {
						this.encode_UInt32(GDScriptTypes.PROJECTION, model);
						this.encode_Projection(value, model);
					} else if (value instanceof Quat) {
						this.encode_UInt32(GDScriptTypes.QUATERNION, model);
						this.encode_Quaternion(value, model);
					} else if (value instanceof AABB) {
						this.encode_UInt32(GDScriptTypes.AABB, model);
						this.encode_AABB(value, model);
					} else if (value instanceof Basis) {
						this.encode_UInt32(GDScriptTypes.BASIS, model);
						this.encode_Basis(value, model);
					} else if (value instanceof Transform3D) {
						this.encode_UInt32(GDScriptTypes.TRANSFORM3D, model);
						this.encode_Transform3D(value, model);
					} else if (value instanceof Color) {
						this.encode_UInt32(GDScriptTypes.COLOR, model);
						this.encode_Color(value, model);
					}
				}
		}

		return model.buffer;
	}

	private encode_AABB(value: AABB, model: BufferModel) {
		this.encode_Vector3(value.position, model);
		this.encode_Vector3(value.size, model);
	}

	private encode_Array(arr: any[], model: BufferModel) {
		let size = arr.length;
		this.encode_UInt32(size, model);
		arr.forEach((e) => {
			this.encode_variant(e, model);
		});
	}

	private encode_Basis(value: Basis, model: BufferModel) {
		this.encode_Vector3(value.x, model);
		this.encode_Vector3(value.y, model);
		this.encode_Vector3(value.z, model);
	}

	private encode_Bool(bool: boolean, model: BufferModel) {
		this.encode_UInt32(bool ? 1 : 0, model);
	}

	private encode_Color(value: Color, model: BufferModel) {
		this.encode_Float32(value.r, model);
		this.encode_Float32(value.g, model);
		this.encode_Float32(value.b, model);
		this.encode_Float32(value.a, model);
	}

	private encode_Dictionary(dict: Map<any, any>, model: BufferModel) {
		let size = dict.size;
		this.encode_UInt32(size, model);
		let keys = Array.from(dict.keys());
		keys.forEach((key) => {
			let value = dict.get(key);
			this.encode_variant(key, model);
			this.encode_variant(value, model);
		});
	}

	private encode_Float64(value: number, model: BufferModel) {
		model.buffer.writeDoubleLE(value, model.offset);
		model.offset += 8;
	}

	private encode_Float32(value: number, model: BufferModel) {
		model.buffer.writeFloatLE(value, model.offset);
		model.offset += 4;
	}

	private encode_Plane(value: Plane, model: BufferModel) {
		this.encode_Float32(value.x, model);
		this.encode_Float32(value.y, model);
		this.encode_Float32(value.z, model);
		this.encode_Float32(value.d, model);
	}

	private encode_Quaternion(value: Quat, model: BufferModel) {
		this.encode_Float32(value.x, model);
		this.encode_Float32(value.y, model);
		this.encode_Float32(value.z, model);
		this.encode_Float32(value.w, model);
	}

	private encode_Rect2(value: Rect2, model: BufferModel) {
		this.encode_Vector2(value.position, model);
		this.encode_Vector2(value.size, model);
	}

	private encode_Rect2i(value: Rect2i, model: BufferModel) {
		this.encode_Vector2i(value.position, model);
		this.encode_Vector2i(value.size, model);
	}

	private encode_String(str: string, model: BufferModel) {
		let str_len = str.length;
		this.encode_UInt32(str_len, model);
		model.buffer.write(str, model.offset, str_len, "utf8");
		model.offset += str_len;
		str_len += 4;
		while (str_len % 4) {
			str_len++;
			model.buffer.writeUInt8(0, model.offset);
			model.offset++;
		}
	}

	private encode_Transform3D(value: Transform3D, model: BufferModel) {
		this.encode_Basis(value.basis, model);
		this.encode_Vector3(value.origin, model);
	}

	private encode_Transform2D(value: Transform2D, model: BufferModel) {
		this.encode_Vector2(value.origin, model);
		this.encode_Vector2(value.x, model);
		this.encode_Vector2(value.y, model);
	}

	private encode_Projection(value: Projection, model: BufferModel) {
		this.encode_Vector4(value.x, model);
		this.encode_Vector4(value.y, model);
		this.encode_Vector4(value.z, model);
		this.encode_Vector4(value.w, model);
	}

	private encode_UInt32(int: number, model: BufferModel) {
		model.buffer.writeUInt32LE(int, model.offset);
		model.offset += 4;
	}

	private encode_Int32(int: number, model: BufferModel) {
		model.buffer.writeInt32LE(int, model.offset);
		model.offset += 4;
	}

	private encode_UInt64(value: bigint, model: BufferModel) {
		const max = (BigInt(1) << BigInt(8)) - BigInt(1);
		let lo = Number(value & max);
		model.buffer[model.offset++] = lo;
		lo = lo >> 8;
		model.buffer[model.offset++] = lo;
		lo = lo >> 8;
		model.buffer[model.offset++] = lo;
		lo = lo >> 8;
		model.buffer[model.offset++] = lo;
		let hi = Number(value >> BigInt(32) & max);
		model.buffer[model.offset++] = hi;
		hi = hi >> 8;
		model.buffer[model.offset++] = hi;
		hi = hi >> 8;
		model.buffer[model.offset++] = hi;
		hi = hi >> 8;
		model.buffer[model.offset++] = hi;
	}

	private encode_Vector2(value: Vector2, model: BufferModel) {
		this.encode_Float32(value.x, model);
		this.encode_Float32(value.y, model);
	}

	private encode_Vector3(value: Vector3, model: BufferModel) {
		this.encode_Float32(value.x, model);
		this.encode_Float32(value.y, model);
		this.encode_Float32(value.z, model);
	}

	private encode_Vector4(value: Vector4, model: BufferModel) {
		this.encode_Float32(value.x, model);
		this.encode_Float32(value.y, model);
		this.encode_Float32(value.z, model);
		this.encode_Float32(value.w, model);
	}

	private encode_Vector2i(value: Vector2i, model: BufferModel) {
		this.encode_Int32(value.x, model);
		this.encode_Int32(value.y, model);
	}

	private encode_Vector3i(value: Vector3i, model: BufferModel) {
		this.encode_Int32(value.x, model);
		this.encode_Int32(value.y, model);
		this.encode_Int32(value.z, model);
	}

	private encode_Vector4i(value: Vector4i, model: BufferModel) {
		this.encode_Int32(value.x, model);
		this.encode_Int32(value.y, model);
		this.encode_Int32(value.z, model);
		this.encode_Int32(value.w, model);
	}

	private encode_StringName(value: StringName, model: BufferModel) {
		this.encode_String(value.value, model);
	}

	private size_Bool(): number {
		return this.size_UInt32();
	}

	private size_Dictionary(dict: Map<any, any>): number {
		let size = this.size_UInt32();
		let keys = Array.from(dict.keys());
		keys.forEach((key) => {
			let value = dict.get(key);
			size += this.size_variant(key);
			size += this.size_variant(value);
		});

		return size;
	}

	private size_String(str: string): number {
		let size = this.size_UInt32() + str.length;
		while (size % 4) {
			size++;
		}
		return size;
	}

	private size_UInt32(): number {
		return 4;
	}

	private size_UInt64(): number {
		return 8;
	}

	private size_array(arr: any[]): number {
		let size = this.size_UInt32();
		arr.forEach((e) => {
			size += this.size_variant(e);
		});

		return size;
	}

	private size_variant(
		value:
			| number
			| bigint
			| boolean
			| string
			| Map<any, any>
			| any[]
			| object
			| undefined
	): number {
		let size = 4;

		if (
			typeof value === "number" &&
			(value > 2147483647 || value < -2147483648)
		) {
			value = BigInt(value);
		}

		switch (typeof value) {
			case "number":
				size += this.size_UInt32();
				break;
			case "bigint":
				size += this.size_UInt64();
				break;
			case "boolean":
				size += this.size_Bool();
				break;
			case "string":
				size += this.size_String(value);
				break;
			case "undefined":
				break;
			default:
				// TODO: size of nodepath, rid, object, callable, signal
				if (Array.isArray(value)) {
					size += this.size_array(value);
					break;
				} else if (value instanceof Map) {
					size += this.size_Dictionary(value);
					break;
				} else if (value instanceof StringName) {
					size += this.size_String(value.value);
					break;
				} else {
					switch (value["__type__"]) {
						case "Vector2":
						case "Vector2i":
							size += this.size_UInt32() * 2;
							break;
						case "Rect2":
						case "Rect2i":
							size += this.size_UInt32() * 4;
							break;
						case "Vector3":
						case "Vector3i":
							size += this.size_UInt32() * 3;
							break;
						case "Vector4":
						case "Vector4i":
							size += this.size_UInt32() * 4;
							break;
						case "Transform2D":
							size += this.size_UInt32() * 6;
							break;
						case "Projection":
							size += this.size_UInt32() * 16;
							break;
						case "Plane":
							size += this.size_UInt32() * 4;
							break;
						case "Quaternion":
							size += this.size_UInt32() * 4;
							break;
						case "AABB":
							size += this.size_UInt32() * 6;
							break;
						case "Basis":
							size += this.size_UInt32() * 9;
							break;
						case "Transform3D":
							size += this.size_UInt32() * 12;
							break;
						case "Color":
							size += this.size_UInt32() * 4;
							break;
					}
				}
				break;
		}

		return size;
	}
}
