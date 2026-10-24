uniform lowp vec4 materialColor;

VARYING_ lowp vec4 varColor;

VARYING_ highp vec3 eyeVec;

void main(void)
{
	gl_Position = mWorldViewProj * inVertexPosition;
 gl_Position.z = gl_Position.w * 0.998 - 1.6;

	vec4 color = inVertexColor;

	color *= materialColor;
	varColor = color;

	eyeVec = -(mWorldView * inVertexPosition).xyz;
}
