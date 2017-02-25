#Highlights syntax highglighting issues in godot-tools release 0.2.2

extends Node

# class member variables go here, for example:
#var a = 2
# var b = "textvar"

#func read(): #in 0.2.2, false positive
#	var path = "res://assets/instructions.toml"
#	var file = File.new()
#	file.open(path, file.READ)
#
#func _ready(): #in 0.2.2 false positive
#	# Called every time the node is added to the scene.
#	# Initialization here
#	read()

func remove_ends(text): #in 0.2.2 false positive
#vasdfs
	var result = text
	result = result.replace("[", "")
	result = result.replace("]", "")
	return result

func read_cfg(path): #in 0.2.2 false positive

	var config = ConfigFile.new() 
	var err = config.load(path)
	
	var sections = {}
	if err == OK: # if not, something went wrong with the file loading
	    # Look for the display/width pair, and default to 1024 if missing
#	   	#var screen_width = get_value("display", "width", 1024) #in 0.2.2 false positive
#	    # Store a variable if and only it hasn't been defined yet
#	    if not config.has_section_key("audio", "mute"):
#	        config.set_value("audio", "mute", false)
#	    # Save the changes by overwriting the previous file
#	    config.save("user://settings.cfg"
		for i in config.get_sections():
			var section_pairs = {}
			for j in config.get_section_keys(i):
				section_pairs[j] = config.get_value(i, j)
			sections[i] = section_pairs
	print(sections)
	return sections

func something(): #in 0.2.2 diagnostics correctly complains
asdfsdd

asdfsdf
asdf
func somethingelse(): #in 0.2.2 correctly doesn't complain
	asdfsd

asdfsd #in 0.2.2 should complain?

func something_else():
	var s = 2 #in 0.2.2 diagnostics should complain
	asdfsdaf s = 3 #in 0.2.2 diagnostics should complain
	return 3

func yet_else():
	pass