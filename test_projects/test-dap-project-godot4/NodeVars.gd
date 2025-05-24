extends Node2D

# Exported properties for testing property editing
@export var test_string: String = "Hello World"
@export var test_number: int = 42
@export var test_float: float = 3.14
@export var test_bool: bool = true
@export_multiline var test_description: String = "This is a multiline\nstring for testing\nvertical layout."

@onready var node_1: Node = $node1
@onready var node_2: Node = $node2

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
  var local_node_1 = node_1;
  print("breakpoint::NodeVars::_ready")
  pass
