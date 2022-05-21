shader_type canvas_item;
shader_type spatial;

/* ************************************************************************** */

// types
void a;
bool b = true;
bool b2 = false;
bvec2 c;
bvec3 d;
bvec4 e;
int f;
ivec2 g;
ivec3 h;
ivec4 i;
uint j;
uvec2 k;
uvec3 l;
uvec4 m;
float n;
vec2 o;
vec3 p;
vec4 q;
mat2 r;
mat3 s;
mat4 t;
sampler2D u;
isampler2D v;
usampler2D w;
samplerCube x;

// qualifiers
uniform int qualifier_a;
global uniform int qualifier_b;
instance uniform int qualifier_c;
varying flat int qualifier_d;

// hints
uniform sampler2D hint_a : hint_albedo; // godot 3
uniform sampler2D hint_b : source_color; // godot 4

uniform sampler2D hint_c : hint_black; // godot 3
uniform sampler2D hint_d : hint_white; // godot 3
uniform sampler2D hint_e : hint_default_black; // godot 4
uniform sampler2D hint_f : hint_default_white; // godot 4

uniform sampler2D hint_g : hint_aniso;

uniform vec4 hint_h : hint_color;
uniform float hint_i : hint_range(0, 1);
uniform vec4 hint_o : hint_color = vec4(1.0);

/* ************************************************************************** */

// the remaining examples are copied directly from 
// https://docs.godotengine.org/en/3.0/tutorials/shading/shading_language.html

float a = 2; // valid
float a = 2.0; // valid
float a = float(2); // valid

// The required amount of scalars
vec4 a = vec4(0.0, 1.0, 2.0, 3.0);
// Complementary vectors and/or scalars
vec4 a = vec4(vec2(0.0, 1.0), vec2(2.0, 3.0));
vec4 a = vec4(vec3(0.0, 1.0, 2.0), 3.0);
// A single scalar for the whole vector
vec4 a = vec4(0.0);

// if and else
if (cond) {

} else {

}

// for loops
for (int i = 0; i < 10; i++) {

}

// while
while (true) {

}


int sum2(int a, int b) {
    return a + b;
}

void sum3(int a, int b, inout int result) {
    result = a + b;
}

/* ************************************************************************** */

struct Test {
    vec3 color;
};

struct MyStruct {
  float power;
  vec3 color;
  Test result;
};

Test foo(MyStruct a, MyStruct b) {
    MyStruct k;
    k.result.color = (a.color + b.color) * k.power;
    return k.result;
}

void fragment() {
    MyStruct inst = MyStruct(0.0, vec3(0.0), Test(vec3(1.0)));
    Test result = foo(inst, MyStruct(1.0, vec3(0, 1, 0), Test(vec3(0.0))));
}
