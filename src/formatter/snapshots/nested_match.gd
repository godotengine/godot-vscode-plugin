# --- IN ---
# Bug #858: nested match loses space
func f():
	var x = 0
	if true: match x:
		0: 123
	if true: if x:
		0
# --- OUT ---
# Bug #858: nested match loses space
func f():
	var x = 0
	if true: match x:
		0: 123
	if true: if x:
		0