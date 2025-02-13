extends Node

var member1 := TestClassA.new()

var str_var := "ScopeVars::member::str_var"
var str_var_member_only := "ScopeVars::member::str_var_member_only"

class ClassFoo:
  var member_ClassFoo
  var str_var := "ScopeVars::ClassFoo::member::str_var"
  var str_var_member_only := "ScopeVars::ClassFoo::member::str_var_member_only"
  func test_function(delta: float) -> void:
    var str_var := "ScopeVars::ClassFoo::test_function::local::str_var"
    print("breakpoint::ScopeVars::ClassFoo::test_function")


func _ready() -> void:
  var str_var := "ScopeVars::_ready::local::str_var"
  var self_var := self
  print("breakpoint::ScopeVars::_ready")
  test(0.123);

func test(val: float):
  var str_var := "ScopeVars::test::local::str_var"
  var foo := ClassFoo.new()
  foo.test_function(val)