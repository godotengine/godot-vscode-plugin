extends Node
class_name ControlFlow

# Testing If-Else Chain
if x > 0:print("positive")
elif x < 0:print("negative")
else:print("zero")

# Single-line if and ternary expression
if check():run()
var result = 10 if is_ready else 0

# Test for and while loops
for i in range(10): print(i)
for item in items:process(item)
while x > 0:x -= 1

# Test nested control flow indentation.
func test():
    if true:for i in 3:print(i)
    if false: match x: 1: pass

# Match vs. dictionary literal
var dict = {"key": "value"}
match dict:
    {"key": "value"}: print("matched")

# Test basic Match branch (no space after colon)
match role:
    "admin":access_level=10
    "moderator","editor":access_level=5
    var matched_role when matched_role.begins_with("user"):access_level=1
    _:access_level=0

# Test Match branch with complex expressions and line breaks.
match state:
    "idle": start_timer()
    "running": 
        update_position()
        check_collisions()
    "jumping": velocity.y = jump_force

# Test nested Match and dictionary matching conflicts.
match x:
    0:
        match y:
            1: pass
            2: pass
    {"key": "value"}: print("dict pattern")
    []: print("array pattern")

# Test multi-value matching with pattern guards.
match x:
    1, 2, 3: print("small")
    var n when n > 10: print("big")
    var n when n < 0: print("negative")
    _: print("other")
