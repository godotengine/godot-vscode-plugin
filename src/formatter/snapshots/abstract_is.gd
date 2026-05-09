# --- IN ---
@abstract
extends RefCounted

@abstract func foo()

func cmp(other: Node):
	if (other is Node):
		pass

	if other is Node:
		pass

	if other is not Node:
		pass
# --- OUT ---
@abstract
extends RefCounted

@abstract func foo()

func cmp(other: Node):
	if (other is Node):
		pass

	if other is Node:
		pass

	if other is not Node:
		pass