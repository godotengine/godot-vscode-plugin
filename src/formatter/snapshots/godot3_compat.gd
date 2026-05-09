# --- IN ---
tool
extends  Node

export  var  speed = 100
export(int,  "Slow",  "Fast")  var  speed2 = "Slow"
export(Array,  String)  var  items = []

onready  var  sprite = $Sprite

remote  func  remote_func():
	pass

master  func  master_func():
	pass

puppet  func  puppet_func():
	pass

remotesync  func  sync_func():
	pass

mastersync  func  master_sync_func():
	pass

puppetsync  func  puppet_sync_func():
	pass

var  health  = 100 setget  set_health ,  get_health
var  name  setget  _set_name ,  _get_name
# --- OUT ---
tool
extends Node

export var speed = 100
export(int, "Slow", "Fast") var speed2 = "Slow"
export(Array, String) var items = []

onready var sprite = $Sprite

remote func remote_func():
	pass

master func master_func():
	pass

puppet func puppet_func():
	pass

remotesync func sync_func():
	pass

mastersync func master_sync_func():
	pass

puppetsync func puppet_sync_func():
	pass

var health = 100 setget set_health, get_health
var name setget _set_name, _get_name

# --- IN ---
# yield (Godot 3 equivalent of await)
func f():
	yield(  signal  ,  "completed"  )
	yield(  get_tree()  ,  "idle_frame"  )
# --- OUT ---
# yield (Godot 3 equivalent of await)
func f():
	yield(signal, "completed")
	yield(get_tree(), "idle_frame")