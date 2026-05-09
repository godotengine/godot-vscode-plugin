# --- IN ---
func f():
	# Method chains
	self.handleDeath()
	sprite.position.x = Vector2.ZERO.x
	[].append(1)
	{}.keys()
	get_node(".").get_child(0)
# --- OUT ---
func f():
	# Method chains
	self.handleDeath()
	sprite.position.x = Vector2.ZERO.x
	[].append(1)
	{}.keys()
	get_node(".").get_child(0)

# --- IN ---
func f():
	# Chained method calls
	get_node(".").get_child(0).get_node("Sub").queue_free()
	Vector2(1, 2).normalized().length()
	"hello".to_upper()
	[1, 2, 3].size()
# --- OUT ---
func f():
	# Chained method calls
	get_node(".").get_child(0).get_node("Sub").queue_free()
	Vector2(1, 2).normalized().length()
	"hello".to_upper()
	[1, 2, 3].size()

# --- IN ---
func f():
	# Function call spacing
	print(1)
	print( 1 )
	some_func(  1,  2,  3  )
	other_func(a, b, c)
# --- OUT ---
func f():
	# Function call spacing
	print(1)
	print(1)
	some_func(1, 2, 3)
	other_func(a, b, c)