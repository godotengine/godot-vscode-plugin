# --- IN ---
# Bug #865: unary minus with multi-char variable names
var ii = 1
var test = -ii
var x = -abc
var y = -z
var a = -1
var b = - 1

func f():
	var val = -my_var
	var val2 = -x
	var val3 = -long_name
# --- OUT ---
# Bug #865: unary minus with multi-char variable names
var ii = 1
var test = -ii
var x = -abc
var y = -z
var a = -1
var b = -1

func f():
	var val = -my_var
	var val2 = -x
	var val3 = -long_name