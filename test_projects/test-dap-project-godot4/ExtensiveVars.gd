extends Node2D

class_name ExtensiveVars

var self_var := self
@onready var label: ExtensiveVars_Label = $Label

# var editor_description := "ExtensiveVars::member::text overrides"
# var rotation = 2

class ClassA:
  var member_classB
  var member_self := self
  var str_var := "ExtensiveVars::ClassA::member::str_var"
  func test_function(delta: float) -> void:
    var str_var := "ExtensiveVars::ClassA::test_function::local::str_var"
    var local_self := self.member_self;
    print("breakpoint::ExtensiveVars::ClassA::test_function")

  
class ClassB:
  var member_classA

func _ready() -> void:
  var local_label := label
  var local_self_var_through_label := label.parent_var
  
  var local_classA = ClassA.new()
  var local_classB = ClassB.new()
  local_classA.member_classB = local_classB
  local_classB.member_classA = local_classA

  var str_var := "ExtensiveVars::_ready::local::str_var"

  # Circular reference.
  # Note: that causes the godot engine to omit this variable, since stack_frame_var cannot be completed and sent
  # https://github.com/godotengine/godot/issues/76019
  # var dict = {}
  # dict["self_ref"] = dict
  
  print("breakpoint::ExtensiveVars::_ready")

func _process(delta: float) -> void:
  var str_var := "ExtensiveVars::_process::local::str_var"
  test(delta)

func test(delta: float):
  var str_var := "ExtensiveVars::test::local::str_var"
  var local_label := label
  var local_self_var_through_label := label.parent_var

  var large_dict = {}
  for i in range(1000):
    large_dict["variable" + str(i)] = "Some very long value, which will be in the dictionary"
  
  var local_classA2 = ClassA.new()
  var local_classB2 = ClassB.new()
  local_classA2.member_classB = local_classB2
  local_classB2.member_classA = local_classA2
  local_classA2.test_function(delta);
  pass
