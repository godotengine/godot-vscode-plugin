extends Node2D

@onready var node_1: Node = $node1
@onready var node_2: Node = $node2

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
  print("breakpoint::NodeVars::_ready")
  pass
