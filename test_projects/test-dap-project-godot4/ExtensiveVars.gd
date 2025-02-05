extends Node2D

var self_var := self
@onready var label: ExtensiveVars_Label = $Label

class ClassA:
  var member_classB
  var member_self := self
  
class ClassB:
  var member_classA

func _ready() -> void:
  var local_label := label
  var local_self_var_through_label := label.parent_var
  
  var local_classA = ClassA.new()
  var local_classB = ClassB.new()
  local_classA.member_classB = local_classB
  local_classB.member_classA = local_classA

  # Circular reference.
  # Note: that causes the godot engine to omit this variable, since stack_frame_var cannot be completed and sent
  # https://github.com/godotengine/godot/issues/76019
  # var dict = {}
  # dict["self_ref"] = dict
  
  print("breakpoint::ExtensiveVars::_ready")

func _process(delta: float) -> void:
  var local_label := label
  var local_self_var_through_label := label.parent_var
  
  var local_classA = ClassA.new()
  var local_classB = ClassB.new()
  local_classA.member_classB = local_classB
  local_classB.member_classA = local_classA
  pass
