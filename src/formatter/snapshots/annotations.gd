# --- IN ---
@onready  var sprite: Sprite2D = $Sprite
@export  var speed: float = 100.0
@export_range(0,  100)  var health: int = 100
@export_flags("fire",  "ice",  "wind")  var elements = 0
# --- OUT ---
@onready var sprite: Sprite2D = $Sprite
@export var speed: float = 100.0
@export_range(0, 100) var health: int = 100
@export_flags("fire", "ice", "wind") var elements = 0

# --- IN ---
@rpc("any_peer",  "call_remote")
@rpc  (  "authority"  ,  "call_remote"  )
func rpc_func():
	pass
# --- OUT ---
@rpc("any_peer", "call_remote")
@rpc("authority", "call_remote")
func rpc_func():
	pass

# --- IN ---
@warning_ignore("integer_division")
@warning_ignore  (  "narrowing_conversion"  )
func warned():
	pass
# --- OUT ---
@warning_ignore("integer_division")
@warning_ignore("narrowing_conversion")
func warned():
	pass

# --- IN ---
@abstract
func abstract_func()

@abstract  func  another_abstract()

@export
var exported_var = 10
# --- OUT ---
@abstract
func abstract_func()

@abstract func another_abstract()

@export
var exported_var = 10

# --- IN ---
@onready @export
var dual_annotated = 5
# --- OUT ---
@onready @export
var dual_annotated = 5