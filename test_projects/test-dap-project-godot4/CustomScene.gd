extends HBoxContainer

class_name CustomScene

var custom_scene_class_member1 = "CustomScene::member1"

var __repr__: String:
  get():
    return "CustomScene %s" % [self.get_instance_id()]

class CustomSubClass:
  var __repr__: String:
    get():
      # return "CustomSubClass(%s)<%s>" % [some_val, (self.get_instance_id())]
      return "CustomSubClass(%s)" % [some_val]
  
  var some_val: String
  func _init(some_val: String) -> void:
    self.some_val = some_val

func _ready() -> void:
  var arr = [CustomSubClass.new("Hello"), CustomSubClass.new("World")]
  var dict = {CustomSubClass.new("Hello"): 1, CustomSubClass.new("World"): 2}
  pass
