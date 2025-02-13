extends Node

var member1 := TestClassA.new()

func _ready() -> void:
  var local1 := TestClassA.new()
  var local2 = GlobalScript.globalMember
  print("breakpoint::ScopeVars::_ready")
