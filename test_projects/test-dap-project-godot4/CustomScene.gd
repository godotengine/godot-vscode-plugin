extends HBoxContainer

class_name CustomSceneClass

var custom_scene_class_member1 = "CustomSceneClass::member1"

var __repr__: String:
  get():
    return "CustomSceneClass %s" % [self.get_instance_id()]
