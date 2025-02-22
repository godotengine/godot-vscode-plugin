extends Node

signal member_signal
signal member_signal_with_parameters(my_param1: String)

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
  var int_var = 42
  var float_var = 3.14
  var bool_var = true
  var string_var = "Hello, Godot!"
  var nil_var = null
  var vector2 = Vector2(10, 20)
  var vector3 = Vector3(1, 2, 3)
  var rect2 = Rect2(0, 0, 100, 50)
  var quaternion = Quaternion(0, 0, 0, 1)
  var simple_array = [1, 2, 3]
  var nested_dict = {
      "nested_key": "Nested Value",
      "sub_dict": {"sub_key": 99},
  }
  var mixed_dict = {
    "nested_array": [1,2, {"nested_dict": [3,4,5]}]
  }
  var byte_array = PackedByteArray([0, 1, 2, 255])
  var int32_array = PackedInt32Array([100, 200, 300])
  var color_var = Color(1, 0, 0, 1) # Red color
  var aabb_var = AABB(Vector3(0, 0, 0), Vector3(1, 1, 1))
  var plane_var = Plane(Vector3(0, 1, 0), -5)

  var callable_var = self.my_callable_func

  var signal_var = member_signal
  member_signal.connect(singal_connected_func)

  print("breakpoint::BuiltInTypes::_ready")
  
func my_callable_func():
  pass

func singal_connected_func():
  pass
