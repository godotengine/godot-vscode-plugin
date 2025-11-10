extends Node2D

@onready var node_1: Node = $node1
@onready var node_2: Node = $node2

@onready var custom_scene: CustomSceneClass = $CustomScene
@onready var scenes_array: Array[CustomSceneClass] = [custom_scene, custom_scene]
@onready var scenes_map: Dictionary[CustomSceneClass, int] = {custom_scene: 3}

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
  var local_node_1 = node_1;
  var nodes_array = [self.node_1, self.node_2]
  print("breakpoint::NodeVars::_ready")
  pass
