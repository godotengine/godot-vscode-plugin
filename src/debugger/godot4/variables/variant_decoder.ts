import {
	GDScriptTypes,
	BufferModel,
	Vector3,
	Vector2,
	Basis,
	AABB,
	Color,
	NodePath,
	ObjectId,
	Plane,
	Quat,
	Rect2,
	Transform3D,
	Transform2D,
	RawObject,
	Vector2i,
	Vector3i,
	Rect2i,
	Vector4,
	Vector4i,
	StringName,
	Projection,
	ENCODE_FLAG_64,
	ENCODE_FLAG_OBJECT_AS_ID,
	RID,
	Callable,
	Signal,
} from "./variants";

export class VariantDecoder {
	public decode_variant(model: BufferModel) {
		let type = this.decode_UInt32(model);
		switch (type & 0xff) {
			case GDScriptTypes.BOOL:
				return this.decode_UInt32(model) !== 0;
			case GDScriptTypes.INT:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Int64(model);
				} else {
					return this.decode_Int32(model);
				}
			case GDScriptTypes.FLOAT:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Float64(model);
				} else {
					return this.decode_Float32(model);
				}
			case GDScriptTypes.STRING:
				return this.decode_String(model);
			case GDScriptTypes.VECTOR2:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Vector2d(model);
				} else {
					return this.decode_Vector2f(model);
				}
			case GDScriptTypes.VECTOR2I:
				return this.decode_Vector2i(model);
			case GDScriptTypes.RECT2:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Rect2d(model);
				} else {
					return this.decode_Rect2f(model);
			}
			case GDScriptTypes.RECT2I:
				return this.decode_Rect2i(model);
			case GDScriptTypes.VECTOR3:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Vector3d(model);
				} else {
					return this.decode_Vector3f(model);
				}
			case GDScriptTypes.VECTOR3I:
				return this.decode_Vector3i(model);
			case GDScriptTypes.TRANSFORM2D:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Transform2Dd(model);
				} else {
					return this.decode_Transform2Df(model);
				}
			case GDScriptTypes.PLANE:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Planed(model);
				} else {
					return this.decode_Planef(model);
				}
			case GDScriptTypes.VECTOR4:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Vector4d(model);
				} else {
					return this.decode_Vector4f(model);
				}
			case GDScriptTypes.VECTOR4I:
				return this.decode_Vector4i(model);
			case GDScriptTypes.QUATERNION:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Quaterniond(model);
				} else {
					return this.decode_Quaternionf(model);
				}
			case GDScriptTypes.AABB:
				if (type & ENCODE_FLAG_64) {
					return this.decode_AABBd(model);
				} else {
					return this.decode_AABBf(model);
				}
			case GDScriptTypes.BASIS:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Basisd(model);
				} else {
					return this.decode_Basisf(model);
				}
			case GDScriptTypes.TRANSFORM3D:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Transform3Dd(model);
				} else {
					return this.decode_Transform3Df(model);
				}
			case GDScriptTypes.PROJECTION:
				if (type & ENCODE_FLAG_64) {
					return this.decode_Projectiond(model);
				} else {
					return this.decode_Projectionf(model);
				}
			case GDScriptTypes.COLOR:
				return this.decode_Color(model);
			case GDScriptTypes.STRING_NAME:
				return this.decode_StringName(model);
			case GDScriptTypes.NODE_PATH:
				return this.decode_NodePath(model);
			case GDScriptTypes.RID:
				return this.decode_RID(model);
			case GDScriptTypes.OBJECT:
				if (type & ENCODE_FLAG_OBJECT_AS_ID) {
					return this.decode_Object_id(model);
				} else {
					return this.decode_Object(model);
				}
			case GDScriptTypes.CALLABLE:
				return this.decode_Callable(model);
			case GDScriptTypes.SIGNAL:
				return this.decode_Signal(model);
			case GDScriptTypes.DICTIONARY:
				return this.decode_Dictionary(model);
			case GDScriptTypes.ARRAY:
				return this.decode_Array(model);
			case GDScriptTypes.PACKED_BYTE_ARRAY:
				return this.decode_PackedByteArray(model);
			case GDScriptTypes.PACKED_INT32_ARRAY:
				return this.decode_PackedInt32Array(model);
			case GDScriptTypes.PACKED_INT64_ARRAY:
				return this.decode_PackedInt64Array(model);
			case GDScriptTypes.PACKED_FLOAT32_ARRAY:
				return this.decode_PackedFloat32Array(model);
			case GDScriptTypes.PACKED_FLOAT64_ARRAY:
				return this.decode_PackedFloat32Array(model);
			case GDScriptTypes.PACKED_STRING_ARRAY:
				return this.decode_PackedStringArray(model);
			case GDScriptTypes.PACKED_VECTOR2_ARRAY:
				if (type & ENCODE_FLAG_OBJECT_AS_ID) {
					return this.decode_PackedVector2dArray(model);
				} else {
					return this.decode_PackedVector2fArray(model);
				}
			case GDScriptTypes.PACKED_VECTOR3_ARRAY:
				if (type & ENCODE_FLAG_OBJECT_AS_ID) {
					return this.decode_PackedVector3dArray(model);
				} else {
					return this.decode_PackedVector3fArray(model);
				}
			case GDScriptTypes.PACKED_COLOR_ARRAY:
				return this.decode_PackedColorArray(model);
			default:
				return undefined;
		}
	}

	public get_dataset(buffer: Buffer, offset: number) {
		let len = buffer.readUInt32LE(offset);
		let model: BufferModel = {
			buffer: buffer,
			offset: offset + 4,
			len: len,
		};

		let output = [];
		output.push(len + 4);
		do {
			let value = this.decode_variant(model);
			if (value === undefined) {
				throw new Error("Unable to decode variant.");
			}
			output.push(value);
		} while (model.len > 0);

		return output;
	}

	private decode_AABBf(model: BufferModel) {
		return new AABB(this.decode_Vector3f(model), this.decode_Vector3f(model));
	}

	private decode_AABBd(model: BufferModel) {
		return new AABB(this.decode_Vector3d(model), this.decode_Vector3d(model));
	}

	private decode_Array(model: BufferModel) {
		let output: Array<any> = [];

		let count = this.decode_UInt32(model);

		for (let i = 0; i < count; i++) {
			let value = this.decode_variant(model);
			output.push(value);
		}

		return output;
	}

	private decode_Basisf(model: BufferModel) {
		return new Basis(
			this.decode_Vector3f(model),
			this.decode_Vector3f(model),
			this.decode_Vector3f(model)
		);
	}

	private decode_Basisd(model: BufferModel) {
		return new Basis(
			this.decode_Vector3d(model),
			this.decode_Vector3d(model),
			this.decode_Vector3d(model)
		);
	}

	private decode_Color(model: BufferModel) {
		let rgb = this.decode_Vector3f(model);
		let a = this.decode_Float32(model);

		return new Color(rgb.x, rgb.y, rgb.z, a);
	}

	private decode_Dictionary(model: BufferModel) {
		let output = new Map<any, any>();

		let count = this.decode_UInt32(model);
		for (let i = 0; i < count; i++) {
			let key = this.decode_variant(model);
			let value = this.decode_variant(model);
			output.set(key, value);
		}

		return output;
	}

	private decode_Float32(model: BufferModel) {
		let f = model.buffer.readFloatLE(model.offset);

		model.offset += 4;
		model.len -= 4;

		return f; // + (f < 0 ? -1e-10 : 1e-10);
	}

	private decode_Float64(model: BufferModel) {
		let f = model.buffer.readDoubleLE(model.offset);

		model.offset += 8;
		model.len -= 8;

		return f; // + (f < 0 ? -1e-10 : 1e-10);
	}

	private decode_Int32(model: BufferModel) {
		let u = model.buffer.readInt32LE(model.offset);

		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_Int64(model: BufferModel) {
		let hi = model.buffer.readInt32LE(model.offset);
		let lo = model.buffer.readInt32LE(model.offset + 4);

		let u: BigInt = BigInt((hi << 32) | lo);

		model.len -= 8;
		model.offset += 8;

		return u;
	}

	private decode_NodePath(model: BufferModel) {
		let name_count = this.decode_UInt32(model) & 0x7fffffff;
		let subname_count = this.decode_UInt32(model);
		let flags = this.decode_UInt32(model);
		let is_absolute = (flags & 1) === 1;
		if (flags & 2) {
			//Obsolete format with property separate from subPath
			subname_count++;
		}

		let total = name_count + subname_count;
		let names: string[] = [];
		let sub_names: string[] = [];
		for (let i = 0; i < total; i++) {
			let str = this.decode_String(model);
			if (i < name_count) {
				names.push(str);
			} else {
				sub_names.push(str);
			}
		}

		return new NodePath(names, sub_names, is_absolute);
	}

	private decode_Object(model: BufferModel) {
		let class_name = this.decode_String(model);
		let prop_count = this.decode_UInt32(model);
		let output = new RawObject(class_name);

		for (let i = 0; i < prop_count; i++) {
			let name = this.decode_String(model);
			let value = this.decode_variant(model);
			output.set(name, value);
		}

		return output;
	}

	private decode_Object_id(model: BufferModel) {
		let id = this.decode_UInt64(model);

		return new ObjectId(id);
	}

	private decode_RID(model: BufferModel) {
		let id = this.decode_UInt64(model);

		return new RID(id);
	}

	private decode_Callable(model: BufferModel) {
		return new Callable();
	}

	private decode_Signal(model: BufferModel) {
		return new Signal(this.decode_String(model), this.decode_Object_id(model));
	}

	private decode_Planef(model: BufferModel) {
		let x = this.decode_Float32(model);
		let y = this.decode_Float32(model);
		let z = this.decode_Float32(model);
		let d = this.decode_Float32(model);

		return new Plane(x, y, z, d);
	}

	private decode_Planed(model: BufferModel) {
		let x = this.decode_Float64(model);
		let y = this.decode_Float64(model);
		let z = this.decode_Float64(model);
		let d = this.decode_Float64(model);

		return new Plane(x, y, z, d);
	}

	private decode_PackedByteArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(model.buffer.readUInt8(model.offset));
			model.offset++;
			model.len--;
		}

		return output;
	}

	private decode_PackedColorArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Color[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Color(model));
		}

		return output;
	}

	private decode_PackedFloat32Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Float32(model));
		}

		return output;
	}

	private decode_PackedFloat64Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Float64(model));
		}

		return output;
	}

	private decode_PackedInt32Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: number[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Int32(model));
		}

		return output;
	}

	private decode_PackedInt64Array(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: BigInt[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Int64(model));
		}

		return output;
	}

	private decode_PackedStringArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: string[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_String(model));
		}

		return output;
	}

	private decode_PackedVector2fArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector2[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector2f(model));
		}

		return output;
	}

	private decode_PackedVector3fArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector3[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector3f(model));
		}

		return output;
	}

	private decode_PackedVector2dArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector2[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector2d(model));
		}

		return output;
	}

	private decode_PackedVector3dArray(model: BufferModel) {
		let count = this.decode_UInt32(model);
		let output: Vector3[] = [];
		for (let i = 0; i < count; i++) {
			output.push(this.decode_Vector3d(model));
		}

		return output;
	}

	private decode_Quaternionf(model: BufferModel) {
		let x = this.decode_Float32(model);
		let y = this.decode_Float32(model);
		let z = this.decode_Float32(model);
		let w = this.decode_Float32(model);

		return new Quat(x, y, z, w);
	}

	private decode_Quaterniond(model: BufferModel) {
		let x = this.decode_Float64(model);
		let y = this.decode_Float64(model);
		let z = this.decode_Float64(model);
		let w = this.decode_Float64(model);

		return new Quat(x, y, z, w);
	}

	private decode_Rect2f(model: BufferModel) {
		return new Rect2(this.decode_Vector2f(model), this.decode_Vector2f(model));
	}

	private decode_Rect2d(model: BufferModel) {
		return new Rect2(this.decode_Vector2d(model), this.decode_Vector2d(model));
	}

	private decode_Rect2i(model: BufferModel) {
		return new Rect2i(this.decode_Vector2f(model), this.decode_Vector2f(model));
	}

	private decode_String(model: BufferModel) {
		let len = this.decode_UInt32(model);
		let pad = 0;
		if (len % 4 !== 0) {
			pad = 4 - (len % 4);
		}

		let str = model.buffer.toString("utf8", model.offset, model.offset + len);
		len += pad;

		model.offset += len;
		model.len -= len;

		return str;
	}

	private decode_StringName(model: BufferModel) {
		return new StringName(this.decode_String(model));
	}

	private decode_Transform3Df(model: BufferModel) {
		return new Transform3D(this.decode_Basisf(model), this.decode_Vector3f(model));
	}

	private decode_Transform3Dd(model: BufferModel) {
		return new Transform3D(this.decode_Basisd(model), this.decode_Vector3d(model));
	}

	private decode_Projectionf(model: BufferModel) {
		return new Projection(this.decode_Vector4f(model), this.decode_Vector4f(model), this.decode_Vector4f(model), this.decode_Vector4f(model));
	}

	private decode_Projectiond(model: BufferModel) {
		return new Projection(this.decode_Vector4d(model), this.decode_Vector4d(model), this.decode_Vector4d(model), this.decode_Vector4d(model));
	}

	private decode_Transform2Df(model: BufferModel) {
		return new Transform2D(
			this.decode_Vector2f(model),
			this.decode_Vector2f(model),
			this.decode_Vector2f(model)
		);
	}

	private decode_Transform2Dd(model: BufferModel) {
		return new Transform2D(
			this.decode_Vector2d(model),
			this.decode_Vector2d(model),
			this.decode_Vector2d(model)
		);
	}

	private decode_UInt32(model: BufferModel) {
		let u = model.buffer.readUInt32LE(model.offset);
		model.len -= 4;
		model.offset += 4;

		return u;
	}

	private decode_UInt64(model: BufferModel) {
		const first = model.buffer[model.offset];
		const last = model.buffer[model.offset + 7];
		const val =
			model.buffer[model.offset + 4] +
			model.buffer[model.offset + 5] * 2 ** 8 +
			model.buffer[model.offset + 6] * 2 ** 16 +
			(last << 24); // Overflow
		const result = (
			(BigInt(val) << BigInt(32)) +
			BigInt(
				first +
					model.buffer[model.offset + 1] * 2 ** 8 +
					model.buffer[model.offset + 2] * 2 ** 16 +
					model.buffer[model.offset + 3] * 2 ** 24,
			)
		);
		model.len -= 8;
		model.offset += 8;
		return result;
	}

	private decode_Vector2f(model: BufferModel) {
		let x = this.decode_Float32(model);
		let y = this.decode_Float32(model);

		return new Vector2(x, y);
	}

	private decode_Vector2d(model: BufferModel) {
		let x = this.decode_Float64(model);
		let y = this.decode_Float64(model);

		return new Vector2(x, y);
	}

	private decode_Vector2i(model: BufferModel) {
		let x = this.decode_Int32(model);
		let y = this.decode_Int32(model);

		return new Vector2i(x, y);
	}

	private decode_Vector3f(model: BufferModel) {
		let x = this.decode_Float32(model);
		let y = this.decode_Float32(model);
		let z = this.decode_Float32(model);

		return new Vector3(x, y, z);
	}

	private decode_Vector3d(model: BufferModel) {
		let x = this.decode_Float64(model);
		let y = this.decode_Float64(model);
		let z = this.decode_Float64(model);

		return new Vector3(x, y, z);
	}

	private decode_Vector3i(model: BufferModel) {
		let x = this.decode_Int32(model);
		let y = this.decode_Int32(model);
		let z = this.decode_Int32(model);

		return new Vector3i(x, y, z);
	}

	private decode_Vector4f(model: BufferModel) {
		let x = this.decode_Float32(model);
		let y = this.decode_Float32(model);
		let z = this.decode_Float32(model);
		let w = this.decode_Float32(model);

		return new Vector4(x, y, z, w);
	}

	private decode_Vector4d(model: BufferModel) {
		let x = this.decode_Float64(model);
		let y = this.decode_Float64(model);
		let z = this.decode_Float64(model);
		let w = this.decode_Float64(model);

		return new Vector4(x, y, z, w);
	}

	private decode_Vector4i(model: BufferModel) {
		let x = this.decode_Int32(model);
		let y = this.decode_Int32(model);
		let z = this.decode_Int32(model);
		let w = this.decode_Int32(model);

		return new Vector4i(x, y, z, w);
	}
}
