shader_type spatial;
render_mode wireframe;

const lowp vec3 v[1] = lowp vec3[1] ( vec3(0, 0, 1) );

void fn() {
  // The required amount of scalars
  vec4 a0 = vec4(0.0, 1.0, 2.0, 3.0);
  // Complementary vectors and/or scalars
  vec4 a1 = vec4(vec2(0.0, 1.0), vec2(2.0, 3.0));
  vec4 a2 = vec4(vec3(0.0, 1.0, 2.0), 3.0);
  // A single scalar for the whole vector
  vec4 a3 = vec4(0.0);

  mat2 m2 = mat2(vec2(1.0, 0.0), vec2(0.0, 1.0));
  mat3 m3 = mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
  mat4 identity = mat4(1.0);

  mat3 basis = mat3(identity);
  mat4 m4 = mat4(basis);
  mat2 m2a = mat2(m4);

  vec4 a = vec4(0.0, 1.0, 2.0, 3.0);
  vec3 b = a.rgb; // Creates a vec3 with vec4 components.
  vec3 b1 = a.ggg; // Also valid; creates a vec3 and fills it with a single vec4 component.
  vec3 b2 = a.bgr; // "b" will be vec3(2.0, 1.0, 0.0).
  vec3 b3 = a.xyz; // Also rgba, xyzw are equivalent.
  vec3 b4 = a.stp; // And stpq (for texture coordinates).
  b.bgr = a.rgb; // Valid assignment. "b"'s "blue" component will be "a"'s "red" and vice versa.

  lowp vec4 v0 = vec4(0.0, 1.0, 2.0, 3.0); // low precision, usually 8 bits per component mapped to 0-1
  mediump vec4 v1 = vec4(0.0, 1.0, 2.0, 3.0); // medium precision, usually 16 bits or half float
  highp vec4 v2 = vec4(0.0, 1.0, 2.0, 3.0); // high precision, uses full float or integer range (default)

  const vec2 aa = vec2(0.0, 1.0);
  vec2 bb;
  bb = aa; // valid

  const vec2 V1 = vec2(1, 1), V2 = vec2(2, 2);

  float fa = 1.0;
  float fb = 1.0f;
  float fc = 1e-1;

  uint ua = 1u;
  uint ub = uint(1);
  
  bool cond = false;
  // `if` and `else`.
  if (cond) {
  } else {
  }
  // Ternary operator.
  // This is an expression that behaves like `if`/`else` and returns the value.
  // If `cond` evaluates to `true`, `result` will be `9`.
  // Otherwise, `result` will be `5`.
  int i, result = cond ? 9 : 5;
  // `switch`.
  switch (i) { // `i` should be a signed integer expression.
    case -1:
      break;
    case 0:
      return; // `break` or `return` to avoid running the next `case`.
    case 1: // Fallthrough (no `break` or `return`): will run the next `case`.
    case 2:
      break;
    //...
    default: // Only run if no `case` above matches. Optional.
      break;
  }
  // `for` loop. Best used when the number of elements to iterate on
  // is known in advance.
  for (int i = 0; i < 10; i++) {
  }
  // `while` loop. Best used when the number of elements to iterate on
  // is not known in advance.
  while (cond) {
  }
  // `do while`. Like `while`, but always runs at least once even if `cond`
  // never evaluates to `true`.
  do {
  } while (cond);
}

const float PI_ = 3.14159265358979323846;

struct PointLight {
  vec3 position;
  vec3 color;
  float intensity;
};

struct Scene {
  PointLight lights[2];
};

const Scene scene = Scene(PointLight[2](
  PointLight(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), 1.0),
  PointLight(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), 1.0)
));

Scene construct_scene(PointLight light1, PointLight light2) {
  return Scene({light1, light2});
}

varying flat vec3 some_color;

varying float var_arr[3];

varying smooth vec3 some_light;

uniform float some_value;

uniform vec4 color : hint_color;
uniform float amount : hint_range(0, 1);
uniform vec4 other_color : hint_color = vec4(1.0);

uniform vec4 some_vector = vec4(0.0);
uniform vec4 some_color2 : hint_color = vec4(1.0);

void vertex() {
  const float arr[] = { 1.0, 0.5, 0.0 };
  COLOR.r = arr[0]; // valid
  
  float arr2[3];
  arr2[0] = 1.0; // setter
  COLOR.r = arr2[0]; // getter
  
  PointLight light;
  light.position = vec3(0.0);
  light.color = vec3(1.0, 0.0, 0.0);
  light.intensity = 0.5;
  
  COLOR.rgb = construct_scene(
    PointLight(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), 1.0),
    PointLight(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.0, 1.0), 1.0)
  ).lights[0].color;

  some_color = NORMAL; // Make the normal the color.
  
  var_arr[0] = 1.0;
  var_arr[1] = 0.0;
}

void fragment() {
  float arr[3];
  
  float float_arr[3] = float[3] (1.0, 0.5, 0.0); // first constructor
  int int_arr[3] = int[] (2, 1, 0); // second constructor
  vec2 vec2_arr[3] = { vec2(1.0, 1.0), vec2(0.5, 0.5), vec2(0.0, 0.0) }; // third constructor
  bool bool_arr[] = { true, true, false }; // fourth constructor - size is defined automatically from the element count
  
  float a[3] = float[3] (1.0, 0.5, 0.0),
  b[2] = { 1.0, 0.5 },
  c[] = { 0.7 },
  d = 0.0,
  e[5];
  
  float arr2[] = { 0.0, 1.0, 0.5, -1.0 };
  for (int i = 0; i < arr2.length(); i++) {
  }
  
  ALBEDO = v[0];
  
  PointLight light = PointLight(vec3(0.0), vec3(1.0, 0.0, 0.0), 0.5);
  
  ALBEDO = scene.lights[0].color;
  
  const float EPSILON = 0.0001, value = 0.f;
  if (value >= 0.3 - EPSILON && value <= 0.3 + EPSILON) {
    discard;
  }
  
  ALBEDO = vec3(var_arr[0], var_arr[1], var_arr[2]); // red color
  
  some_light = ALBEDO * 100.0; // Make a shining light.
}

void sum2(int a, in int b, inout int result) {
  result = a + b;
}
void sub2(const int a, const in int b, out int result) {
  result = a - b;
}

global uniform sampler2D global1;
instance uniform int un = 0;

void light() {
  DIFFUSE_LIGHT = some_color * 100.; // optionally
  
  DIFFUSE_LIGHT = some_light;
}
