# --- IN ---
func f() -> void:
	pass

func f()  ->int:
	pass

func f() ->  int :
	pass

func f(a: int) -> String:
	pass

func f() ->  Dictionary:
	pass

func f() -> Array[int]:
	pass

func f() -> Dictionary[String, int]:
	pass
# --- OUT ---
func f() -> void:
	pass

func f() -> int:
	pass

func f() -> int:
	pass

func f(a: int) -> String:
	pass

func f() -> Dictionary:
	pass

func f() -> Array[int]:
	pass

func f() -> Dictionary[String, int]:
	pass

# --- IN ---
class_name  MyClass
extends  Node
# --- OUT ---
class_name MyClass
extends Node

# --- IN ---
signal  my_signal
signal  signal_with_args(  a ,  b  )
# --- OUT ---
signal my_signal
signal signal_with_args(a, b)

# --- IN ---
static  func  static_func():
	pass

static  var  static_var = 10
# --- OUT ---
static func static_func():
	pass

static var static_var = 10