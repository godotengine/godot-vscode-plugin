# --- IN ---
var d = {  "a" :  1 ,  "b" :  2 ,  "c" :  3  }
# --- OUT ---
var d = {"a": 1, "b": 2, "c": 3}

# --- IN ---
var d3 = {
	"a" : 1 ,
	"b" : 2 ,
}
# --- OUT ---
var d3 = {
	"a": 1,
	"b": 2,
}

# --- IN ---
var nested = {"outer":  {"inner":  1}}
var mixed = {1:  "one" ,  2  : "two"}
var typed: Dictionary = {}
# --- OUT ---
var nested = {"outer": {"inner": 1}}
var mixed = {1: "one", 2: "two"}
var typed: Dictionary = {}

# --- IN ---
var typed_arr: Array[int] = [1, 2, 3]
var typed_dict: Dictionary[String, int] = {"a": 1}
# --- OUT ---
var typed_arr: Array[int] = [1, 2, 3]
var typed_dict: Dictionary[String, int] = {"a": 1}

# --- IN ---
func f():
	var d = {}
	d["key"]  =  value
	d[  "key"  ] = value
# --- OUT ---
func f():
	var d = {}
	d["key"] = value
	d["key"] = value