// Ported from osu.Framework/Resources/Shaders: Internal/sh_GlobalUniforms.h, Internal/sh_Vertex_Output.h, sh_Utils.h, sh_Masking.h,
// sh_TextureWrapping.h, sh_Texture2D.vs, sh_Texture.fs.
//
// The sources are GLSL 450 written for Veldrid; these are the same functions as GLSL ES 3.00 for WebGL2. Differences, none of which
// change the maths:
//  - separate texture/sampler objects become one sampler2D; `layout(location)` varyings become named varyings;
//  - every precision is highp. Desktop GL (and Metal, which the client uses on macOS) ignores lowp/mediump, so a mobile-style
//    half-float mediump would be less precise than the client;
//  - int literals in float expressions are written as floats (GLSL ES has no implicit conversion);
//  - the vertex has no m_BackbufferDrawDepth: the front-to-back opaque interior pass (an overdraw optimisation) is not ported.

/** Automatically included in every shader (Internal/sh_GlobalUniforms.h). The std140 offsets are mirrored by Renderer's uniform writer. */
export const GLOBAL_UNIFORMS = /* glsl */ `
layout(std140) uniform g_GlobalUniforms
{
    // Whether the backbuffer is currently being drawn to.
    bool g_BackbufferDraw;

    // Whether the depth values range from 0 to 1. If false, depth values range from -1 to 1.
    // OpenGL uses [-1, 1], Vulkan/D3D/MTL all use [0, 1].
    bool g_IsDepthRangeZeroToOne;

    // Whether the clip space ranges from -1 (top) to 1 (bottom). If false, the clip space ranges from -1 (bottom) to 1 (top).
    bool g_IsClipSpaceYInverted;

    // Whether the texture coordinates begin in the top-left of the texture. If false, (0, 0) is the bottom-left texel of the texture.
    bool g_IsUvOriginTopLeft;

    mat4 g_ProjMatrix;
    mat3 g_ToMaskingSpace;

    bool g_IsMasking;
    highp float g_CornerRadius;
    highp float g_CornerExponent;
    highp vec4 g_MaskingRect;
    highp float g_BorderThickness;
    highp mat4 g_BorderColour;
    highp float g_MaskingBlendRange;
    highp float g_AlphaExponent;
    highp vec2 g_EdgeOffset;
    bool g_DiscardInner;
    highp float g_InnerCornerRadius;

    // 0 -> None
    // 1 -> ClampToEdge
    // 2 -> ClampToBorder
    // 3 -> Repeat
    int g_WrapModeS;
    int g_WrapModeT;
};
`;

/** The size of the g_GlobalUniforms block in bytes (std140). */
export const GLOBAL_UNIFORMS_SIZE = 272;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
${GLOBAL_UNIFORMS}`;

/** Internal/sh_Vertex_Output.h: wraps a vertex shader's main. */
const vertexOutput = (realMain: string) => /* glsl */ `
void main()
{
    ${realMain}(); // Invoke real main func

    if (g_IsDepthRangeZeroToOne)
        gl_Position.z = gl_Position.z / 2.0 + 0.5;

    // When the device's texture coordinates are inverted, and when we are outputting to a framebuffer,
    // we should ensure that the framebuffer output is also inverted so that it's treated as a normal texture
    // later on in the frame.
    bool requiresFramebufferInvert = !g_BackbufferDraw && !g_IsUvOriginTopLeft;

    if (g_IsClipSpaceYInverted || requiresFramebufferInvert)
        gl_Position.y = -gl_Position.y;
}
`;

/** sh_Utils.h */
export const UTILS = /* glsl */ `
// perform alpha compositing of two colour components.
// see http://apoorvaj.io/alpha-compositing-opengl-blending-and-premultiplied-alpha.html
vec4 blend(vec4 src, vec4 dst)
{
    float finalAlpha = src.a + dst.a * (1.0 - src.a);

    if (finalAlpha == 0.0)
        return vec4(0.0);

    return vec4(
        (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / finalAlpha,
        finalAlpha
    );
}

// http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl
// slightly amended to also handle alpha
vec4 hsv2rgb(vec4 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return vec4(c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y), c.w);
}

// decodes 24-bit float from 4 8-bit floats (https://aras-p.info/blog/2009/07/30/encoding-floats-to-rgba-the-final/)
float decodeFloat(vec4 frameBuffer)
{
    return dot(frameBuffer, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0));
}

// encodes 24-bit [0, 1) float to 4 8-bit floats (https://aras-p.info/blog/2009/07/30/encoding-floats-to-rgba-the-final/)
vec4 encodeFloat(float value)
{
    vec4 enc = value * vec4(1.0, 255.0, 65025.0, 16581375.0);
    enc = fract(enc);
    enc -= enc.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
    return enc;
}
`;

/** sh_Masking.h (fragment inputs + getRoundedColor). */
export const MASKING = /* glsl */ `
in vec2 v_MaskingPosition;
in vec4 v_Colour;
in vec4 v_TexRect;
in vec2 v_BlendRange;

float distanceFromRoundedRect(vec2 offset, float radius)
{
    vec2 maskingPosition = v_MaskingPosition + offset;

    // Compute offset distance from masking rect in masking space.
    vec2 topLeftOffset = g_MaskingRect.xy - maskingPosition;
    vec2 bottomRightOffset = maskingPosition - g_MaskingRect.zw;

    vec2 distanceFromShrunkRect = max(
        bottomRightOffset + vec2(radius),
        topLeftOffset + vec2(radius));

    float maxDist = max(distanceFromShrunkRect.x, distanceFromShrunkRect.y);

    // Inside the shrunk rectangle
    if (maxDist <= 0.0)
        return maxDist;
    // Outside of the shrunk rectangle
    else
    {
        distanceFromShrunkRect = max(vec2(0.0), distanceFromShrunkRect);
        return pow(pow(distanceFromShrunkRect.x, g_CornerExponent) + pow(distanceFromShrunkRect.y, g_CornerExponent), 1.0 / g_CornerExponent);
    }
}

float distanceFromDrawingRect(vec2 texCoord)
{
    vec2 topLeftOffset = v_TexRect.xy - texCoord;
    topLeftOffset = vec2(
        v_BlendRange.x > 0.0 ? topLeftOffset.x / v_BlendRange.x : 0.0,
        v_BlendRange.y > 0.0 ? topLeftOffset.y / v_BlendRange.y : 0.0);

    vec2 bottomRightOffset = texCoord - v_TexRect.zw;
    bottomRightOffset = vec2(
        v_BlendRange.x > 0.0 ? bottomRightOffset.x / v_BlendRange.x : 0.0,
        v_BlendRange.y > 0.0 ? bottomRightOffset.y / v_BlendRange.y : 0.0);

    vec2 xyDistance = max(topLeftOffset, bottomRightOffset);
    return max(xyDistance.x, xyDistance.y);
}

vec4 getBorderColour()
{
    vec2 relativeTexCoord = v_MaskingPosition / (g_MaskingRect.zw - g_MaskingRect.xy);
    vec4 top = mix(g_BorderColour[0], g_BorderColour[2], relativeTexCoord.x);
    vec4 bottom = mix(g_BorderColour[1], g_BorderColour[3], relativeTexCoord.x);
    return mix(top, bottom, relativeTexCoord.y);
}

vec4 getRoundedColor(vec4 texel, vec2 texCoord)
{
    if (!g_IsMasking && v_BlendRange == vec2(0.0))
    {
        return v_Colour * texel;
    }

    float dist = distanceFromRoundedRect(vec2(0.0), g_CornerRadius);
    float alphaFactor = 1.0;

    // Discard inner pixels
    if (g_DiscardInner)
    {
        float innerDist = (g_EdgeOffset == vec2(0.0) && g_InnerCornerRadius == g_CornerRadius) ?
            dist : distanceFromRoundedRect(g_EdgeOffset, g_InnerCornerRadius);

        // v_BlendRange is set from outside in a hacky way to tell us the g_MaskingBlendRange used for the rounded
        // corners of the edge effect container itself. We can then derive the alpha factor for smooth inner edge
        // effect from that.
        float innerBlendFactor = (g_InnerCornerRadius - g_MaskingBlendRange - innerDist) / v_BlendRange.x;
        if (innerBlendFactor > 1.0)
        {
            return vec4(0.0);
        }

        // We exponentiate our factor to exactly counteract the later exponentiation by g_AlphaExponent for a smoother inner border.
        alphaFactor = pow(min(1.0 - innerBlendFactor, 1.0), 1.0 / g_AlphaExponent);
    }

    dist /= g_MaskingBlendRange;

    // This correction is needed to avoid fading of the alpha value for radii below 1px.
    float radiusCorrection = g_CornerRadius <= 0.0 ? g_MaskingBlendRange : max(0.0, g_MaskingBlendRange - g_CornerRadius);
    float fadeStart = (g_CornerRadius + radiusCorrection) / g_MaskingBlendRange;
    alphaFactor *= min(fadeStart - dist, 1.0);

    if (v_BlendRange.x > 0.0 || v_BlendRange.y > 0.0)
    {
        alphaFactor *= clamp(1.0 - distanceFromDrawingRect(texCoord), 0.0, 1.0);
    }

    if (alphaFactor <= 0.0)
    {
        return vec4(0.0);
    }

    // This ends up softening glow without negatively affecting edge smoothness much.
    alphaFactor = pow(alphaFactor, g_AlphaExponent);

    float borderStart = 1.0 + fadeStart - g_BorderThickness;
    float colourWeight = min(borderStart - dist, 1.0);

    vec4 contentColour = v_Colour * texel;

    if (colourWeight == 1.0)
        return vec4(contentColour.rgb, contentColour.a * alphaFactor);

    vec4 borderColour = getBorderColour();

    if (colourWeight <= 0.0)
        return vec4(borderColour.rgb, borderColour.a * alphaFactor);

    contentColour.a *= alphaFactor;
    borderColour.a *= 1.0 - colourWeight;
    return blend(borderColour, contentColour);
}
`;

/** sh_TextureWrapping.h */
export const TEXTURE_WRAPPING = /* glsl */ `
float wrap(float coord, int mode, float rangeMin, float rangeMax)
{
    if (mode == 1)
    {
        return clamp(coord, rangeMin, rangeMax);
    }
    else if (mode == 3)
    {
        return mod(coord - rangeMin, rangeMax - rangeMin) + rangeMin;
    }

    return coord;
}

vec2 wrap(vec2 texCoord, vec4 texRect)
{
    return vec2(wrap(texCoord.x, g_WrapModeS, texRect[0], texRect[2]), wrap(texCoord.y, g_WrapModeT, texRect[1], texRect[3]));
}

vec4 wrappedSampler(vec2 wrappedCoord, vec4 texRect, sampler2D wrapSampler, float lodBias)
{
    if (g_WrapModeS == 2 && (wrappedCoord.x < texRect[0] || wrappedCoord.x > texRect[2]) ||
        g_WrapModeT == 2 && (wrappedCoord.y < texRect[1] || wrappedCoord.y > texRect[3]))
        return vec4(0.0);

    return texture(wrapSampler, wrappedCoord, lodBias);
}
`;

/** The vertex attribute locations of TexturedVertex2D (Graphics/Rendering/Vertices/TexturedVertex2D.cs). */
export const TEXTURED_VERTEX_2D_ATTRIBUTES = ['m_Position', 'm_Colour', 'm_TexCoord', 'm_TexRect', 'm_BlendRange'] as const;

/** sh_Texture2D.vs */
export const TEXTURE_2D_VS = `${HEADER}
in vec2 m_Position;
in vec4 m_Colour;
in vec2 m_TexCoord;
in vec4 m_TexRect;
in vec2 m_BlendRange;

out vec2 v_MaskingPosition;
out vec4 v_Colour;
out vec2 v_TexCoord;
out vec4 v_TexRect;
out vec2 v_BlendRange;

void real_main(void)
{
    // Transform from screen space to masking space.
    vec3 maskingPos = g_ToMaskingSpace * vec3(m_Position, 1.0);
    v_MaskingPosition = maskingPos.xy / maskingPos.z;

    v_Colour = m_Colour;
    v_TexCoord = m_TexCoord;
    v_TexRect = m_TexRect;
    v_BlendRange = m_BlendRange;

    gl_Position = g_ProjMatrix * vec4(m_Position, 1.0, 1.0);
}
${vertexOutput('real_main')}`;

/** sh_Texture.fs */
export const TEXTURE_FS = `${HEADER}
${UTILS}
${MASKING}
${TEXTURE_WRAPPING}
in vec2 v_TexCoord;

uniform sampler2D m_Sampler;

out vec4 o_Colour;

void main(void)
{
    vec2 wrappedCoord = wrap(v_TexCoord, v_TexRect);
    o_Colour = getRoundedColor(wrappedSampler(wrappedCoord, v_TexRect, m_Sampler, -0.9), wrappedCoord);
}
`;

/** Builds a fragment shader that uses the masking functions (for the framework's other fragment shaders). */
export function fragmentShader(body: string): string {
  return `${HEADER}\n${UTILS}\n${body}`;
}

/** Builds a vertex shader with the framework's output wrapper; `body` defines `void real_main(void)`. */
export function vertexShader(body: string): string {
  return `${HEADER}\n${body}\n${vertexOutput('real_main')}`;
}

/**
 * Not a port: draws a rectangle of an image into the texture atlas together with its padding, which TextureAtlas.BackingAtlasTexture
 * composes on the CPU (uploadCornerPadding, uploadHorizontalPadding, uploadVerticalPadding): the padding takes the colour of the nearest
 * edge pixel and zero alpha. The viewport is the padded destination rectangle.
 */
export const ATLAS_BLIT_VS = `#version 300 es
void main(void)
{
    // One triangle covering the viewport.
    gl_Position = vec4(float(gl_VertexID == 1) * 4.0 - 1.0, float(gl_VertexID == 2) * 4.0 - 1.0, 0.0, 1.0);
}
`;

export const ATLAS_BLIT_FS = `#version 300 es
precision highp float;

uniform sampler2D m_Sampler;
uniform vec2 u_Destination;
uniform vec2 u_Source;
uniform vec2 u_Size;

out vec4 o_Colour;

void main(void)
{
    vec2 position = floor(gl_FragCoord.xy - u_Destination);
    vec2 clamped = clamp(position, vec2(0.0), u_Size - 1.0);

    vec4 colour = texelFetch(m_Sampler, ivec2(u_Source + clamped), 0);

    o_Colour = vec4(colour.rgb, position == clamped ? colour.a : 0.0);
}
`;

/** sh_Blur.fs (the uniform block m_BlurParameters as plain uniforms) */
export const BLUR_FS = `${HEADER}
${UTILS}
#undef INV_SQRT_2PI
#define INV_SQRT_2PI 0.39894

in vec2 v_TexCoord;

uniform vec2 g_TexSize;
uniform int g_Radius;
uniform float g_Sigma;
uniform vec2 g_BlurDirection;

uniform sampler2D m_Sampler;

out vec4 o_Colour;

float computeGauss(in float x, in float sigma)
{
    return INV_SQRT_2PI * exp(-0.5*x*x / (sigma*sigma)) / sigma;
}

vec4 blur(int radius, vec2 direction, vec2 texCoord, vec2 texSize, float sigma)
{
    float factor = computeGauss(0.0, sigma);
    vec4 sum = texture(m_Sampler, texCoord) * factor;

    float totalFactor = factor;

    for (int i = 2; i <= 200; i += 2)
    {
        float x = float(i) - 0.5;
        factor = computeGauss(x, sigma) * 2.0;
        totalFactor += 2.0 * factor;
        sum += texture(m_Sampler, texCoord + direction * x / texSize) * factor;
        sum += texture(m_Sampler, texCoord - direction * x / texSize) * factor;
        if (i >= radius)
            break;
    }

    float one = g_BackbufferDraw ? 0.0 : 1.0;

    return sum / totalFactor * one;
}

void main(void)
{
    o_Colour = blur(g_Radius, g_BlurDirection, v_TexCoord, g_TexSize, g_Sigma);
}
`;

/** sh_CircularProgress.fs + sh_CircularProgressUtils.h (the uniform block m_CircularProgressParameters as plain uniforms) */
export const CIRCULAR_PROGRESS_FS = `${HEADER}
${UTILS}
${MASKING}
${TEXTURE_WRAPPING}
#undef PI
#define PI 3.1415926536

#undef HALF_PI
#define HALF_PI 1.57079632679

#undef TWO_PI
#define TWO_PI 6.28318530718

in vec2 v_TexCoord;

uniform float innerRadius;
uniform float progress;
uniform float texelSize;
uniform bool roundedCaps;

uniform sampler2D m_Sampler;

out vec4 o_Colour;

float dstToLine(vec2 start, vec2 end, vec2 pixelPos)
{
    vec2 dir = end - start;
    float lineLengthSquared = dir.x * dir.x + dir.y * dir.y;

    if (lineLengthSquared < 0.000001)
        return distance(pixelPos, start);

    vec2 dir2 = pixelPos - start;
    float t = clamp(dot(dir2, dir), 0.0, lineLengthSquared) / lineLengthSquared;
    return distance(pixelPos, start + dir * t);
}

// Returns distance to the progress shape (to closest pixel on it's border)
float distanceToProgress(vec2 pixelPos, float progress, float innerRadius, bool roundedCaps, float texelSize)
{
    // Compute angle of the current pixel in the (0, 2*PI) range
    float pixelAngle = atan(0.5 - pixelPos.y, 0.5 - pixelPos.x) - HALF_PI;

    if (pixelAngle < 0.0)
        pixelAngle += TWO_PI;

    float progressAngle = TWO_PI * progress;

    float pathRadius = 0.25 * innerRadius;

    float halfTexel = texelSize * 0.5;

    if (progress >= 1.0 || pixelAngle < progressAngle) // Pixel inside the sector
        return abs(distance(pixelPos, vec2(0.5)) - (0.5 - pathRadius - halfTexel)) - pathRadius + halfTexel;

    vec2 cs = vec2(cos(progressAngle - HALF_PI), sin(progressAngle - HALF_PI));

    if (roundedCaps) // Pixel outside the sector with rounded caps enabled
    {
        vec2 arcStart = vec2(0.5, pathRadius + halfTexel);
        vec2 arcEnd = vec2(0.5) + cs * vec2(0.5 - pathRadius - halfTexel);

        return min(distance(pixelPos, arcStart), distance(pixelPos, arcEnd)) + halfTexel - pathRadius;
    }

    float dstToIdleEdge = dstToLine(vec2(0.5, texelSize), vec2(0.5, 2.0 * pathRadius), pixelPos);

    vec2 rotatingEdgeTop = vec2(0.5) + cs * vec2(0.5 - texelSize);
    vec2 rotatingEdgeBottom = vec2(0.5) + cs * vec2(0.5 - 2.0 * pathRadius);
    float dstToRotatingEdge = dstToLine(rotatingEdgeTop, rotatingEdgeBottom, pixelPos);
    return min(dstToIdleEdge, dstToRotatingEdge);
}

float progressAlphaAt(vec2 pixelPos, float progress, float innerRadius, bool roundedCaps, float texelSize)
{
    // This is a bit of a hack to make progress appear smooth if it's radius < texelSize by making it more transparent while leaving thickness the same
    float subAAMultiplier = 1.0;
    subAAMultiplier = clamp(innerRadius / (texelSize * 2.0), 0.1, 1.0);
    innerRadius = max(innerRadius, texelSize * 2.0);

    return smoothstep(texelSize, 0.0, distanceToProgress(pixelPos, progress, innerRadius, roundedCaps, texelSize)) * subAAMultiplier;
}

void main(void)
{
    vec2 resolution = v_TexRect.zw - v_TexRect.xy;
    vec2 pixelPos = (v_TexCoord - v_TexRect.xy) / resolution;

    vec2 wrappedCoord = wrap(v_TexCoord, v_TexRect);
    vec4 textureColour = getRoundedColor(wrappedSampler(wrappedCoord, v_TexRect, m_Sampler, -0.9), wrappedCoord);
    o_Colour = vec4(textureColour.rgb, textureColour.a * progressAlphaAt(pixelPos, progress, innerRadius, roundedCaps, texelSize));
}
`;
