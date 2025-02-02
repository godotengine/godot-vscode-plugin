# --- IN ---
func __get():
	pass
func __set(val):
	pass

var a: get = __get, set = __set

var b:
	get = __get,
	set = __set

var c = '':
	get: return __get()
	set(val): __set(val)

var d = '':
	get:
		print('get')
		return __get()
	set(val):
		print('set')
		__set(val)

var e = '' setget __get, __set
