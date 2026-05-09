# --- IN ---
func f(x):
    match x:
        var   y   when y>20:
            pass
# --- OUT ---
func f(x):
    match x:
        var y when y > 20:
            pass

# --- IN ---
func g(x):
	match x:
		1:
			print("one")
		"hello":
			print("greeting")
		_:
			print("default")
# --- OUT ---
func g(x):
	match x:
		1:
			print("one")
		"hello":
			print("greeting")
		_:
			print("default")

# --- IN ---
func h(x):
	match  x :
		[1,  2]:
			print("list")
		{"key":  "val"}:
			print("dict")
		1,  2,  3:
			print("one of these")
# --- OUT ---
func h(x):
	match x:
		[1, 2]:
			print("list")
		{"key": "val"}:
			print("dict")
		1, 2, 3:
			print("one of these")

# --- IN ---
match  x:
	1:
		pass
	2:
		pass
# --- OUT ---
match x:
	1:
		pass
	2:
		pass