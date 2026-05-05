# --- CONFIG ALL ---
{"denseFunctionParameters": true}
# --- IN ---
func f(  a : int = 10  ,  b : String = "hello"  ,  c : float = 3.14  ):
	pass
# --- OUT ---
func f(a: int = 10, b: String = "hello", c: float = 3.14):
	pass

# --- IN ---
# Verify dense mode doesn't break := spacing
func g(x:=1, y:=2):
	pass