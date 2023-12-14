extends Node2D

@onready var sprite: Sprite2D = %Sprite
@onready var sprites = [ %Sprite1,%Sprite2,%Sprite3  ]

@onready var sprite_name = $Sprite
@onready var sprite_names = [$Sprite1,    $Sprite2,   $Sprite3]

func f():
	print("$Sprite1", $Sprite1)
	print("%Sprite1", %Sprite1)
	var a=val % otherVal
