# --- IN ---
# Bug #889: negative indices/keys
func f():
	some_array[-1] = 0
	print(some_array[-1])
	var x = arr[-1]
	var y = dict[-1]
	var z = {"key": [-1]}
# --- OUT ---
# Bug #889: negative indices/keys
func f():
	some_array[-1] = 0
	print(some_array[-1])
	var x = arr[-1]
	var y = dict[-1]
	var z = {"key": [-1]}