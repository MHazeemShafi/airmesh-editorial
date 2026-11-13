
import { useEffect, useRef } from "react";

function normalizeColor(hexCode) {
  return [
    ((hexCode >> 16) & 255) / 255,
    ((hexCode >> 8) & 255) / 255,
    (hexCode & 255) / 255,
  ];
}

class MiniGl {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", { antialias: true });

    if (!this.gl) throw new Error("WebGL not supported");

    const gl = this.gl;
    const self = this;

    this.Uniform = class {
      constructor(options) {
        Object.assign(this, options);
        const types = {
          float: "1f",
          int: "1i",
          vec2: "2fv",
          vec3: "3fv",
          vec4: "4fv",
          mat4: "Matrix4fv",
        };
        this.typeFn = types[this.type || "float"] || "1f";
      }

      update(location) {
        if (this.value === undefined || location === null) return;
        const fn = `uniform${this.typeFn}`;
        if (this.typeFn === "Matrix4fv") {
          gl[fn](location, false, this.value);
        } else {
          gl[fn](location, this.value);
        }
      }

      getDeclaration(name, type, length) {
        if (this.excludeFrom === type) return "";

        if (this.type === "array") {
          return (
            this.value[0].getDeclaration(name, type, this.value.length) +
            `\nconst int ${name}_length = ${this.value.length};`
          );
        }

        if (this.type === "struct") {
          const fields = Object.entries(this.value)
            .map(([field, uniform]) =>
              uniform.getDeclaration(field, type).replace(/^uniform/, "")
            )
            .join("");
          const structName = name.replace("u_", "");
          const capitalized =
            structName.charAt(0).toUpperCase() + structName.slice(1);

          return `uniform struct ${capitalized} {\n${fields}\n} ${name}${length ? `[${length}]` : ""};`;
        }

        return `uniform ${this.type || "float"} ${name}${length ? `[${length}]` : ""};`;
      }
    };

    this.Attribute = class {
      constructor(options) {
        Object.assign(this, options);
        this.buffer = gl.createBuffer();
      }

      update() {
        if (!this.values) return;
        gl.bindBuffer(this.target, this.buffer);
        gl.bufferData(this.target, this.values, gl.STATIC_DRAW);
      }

      attach(name, program) {
        const location = gl.getAttribLocation(program, name);
        this.use(location);
        return location;
      }

      use(location) {
        gl.bindBuffer(this.target, this.buffer);
        if (this.target === gl.ARRAY_BUFFER) {
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(
            location,
            this.size,
            this.type || gl.FLOAT,
            this.normalized || false,
            0,
            0
          );
        }
      }
    };

    this.Material = class {
      constructor(vertexShader, fragmentShader, uniforms = {}) {
        this.uniforms = uniforms;
        this.uniformInstances = [];

        const getShader = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);

          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || "Shader compilation error");
          }

          return shader;
        };

        const declarations = (items, type) =>
          Object.entries(items)
            .map(([name, uniform]) => uniform.getDeclaration(name, type))
            .join("\n");

        const prefix = "precision highp float;";

        const vertexSource = `
          ${prefix}
          attribute vec4 position;
          attribute vec2 uv;
          attribute vec2 uvNorm;
          ${declarations(self.commonUniforms, "vertex")}
          ${declarations(uniforms, "vertex")}
          ${vertexShader}
        `;

        const fragmentSource = `
          ${prefix}
          ${declarations(self.commonUniforms, "fragment")}
          ${declarations(uniforms, "fragment")}
          ${fragmentShader}
        `;

        this.program = gl.createProgram();
        gl.attachShader(this.program, getShader(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(this.program, getShader(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(this.program) || "Program linking error");
        }

        gl.useProgram(this.program);
        this.attachUniforms(undefined, self.commonUniforms);
        this.attachUniforms(undefined, uniforms);
      }

      attachUniforms(name, uniforms) {
        if (name === undefined) {
          Object.entries(uniforms).forEach(([key, value]) =>
            this.attachUniforms(key, value)
          );
        } else if (uniforms.type === "array") {
          uniforms.value.forEach((value, index) =>
            this.attachUniforms(`${name}[${index}]`, value)
          );
        } else if (uniforms.type === "struct") {
          Object.entries(uniforms.value).forEach(([key, value]) =>
            this.attachUniforms(`${name}.${key}`, value)
          );
        } else {
          this.uniformInstances.push({
            uniform: uniforms,
            location: gl.getUniformLocation(this.program, name),
          });
        }
      }
    };

    this.PlaneGeometry = class {
      constructor() {
        this.width = 1;
        this.height = 1;
        this.vertexCount = 0;
        this.xSegCount = 0;
        this.ySegCount = 0;

        this.attributes = {
          position: new self.Attribute({
            target: gl.ARRAY_BUFFER,
            size: 3,
          }),
          uv: new self.Attribute({
            target: gl.ARRAY_BUFFER,
            size: 2,
          }),
          uvNorm: new self.Attribute({
            target: gl.ARRAY_BUFFER,
            size: 2,
          }),
          index: new self.Attribute({
            target: gl.ELEMENT_ARRAY_BUFFER,
            size: 3,
            type: gl.UNSIGNED_SHORT,
          }),
        };
      }

      setTopology(xSegs = 1, ySegs = 1) {
        this.xSegCount = xSegs;
        this.ySegCount = ySegs;
        this.vertexCount = (xSegs + 1) * (ySegs + 1);
        const quadCount = xSegs * ySegs * 2;

        this.attributes.uv.values = new Float32Array(2 * this.vertexCount);
        this.attributes.uvNorm.values = new Float32Array(2 * this.vertexCount);
        this.attributes.index.values = new Uint16Array(3 * quadCount);

        for (let y = 0; y <= ySegs; y++) {
          for (let x = 0; x <= xSegs; x++) {
            const i = y * (xSegs + 1) + x;
            this.attributes.uv.values[2 * i] = x / xSegs;
            this.attributes.uv.values[2 * i + 1] = 1 - y / ySegs;
            this.attributes.uvNorm.values[2 * i] = (x / xSegs) * 2 - 1;
            this.attributes.uvNorm.values[2 * i + 1] = 1 - (y / ySegs) * 2;

            if (x < xSegs && y < ySegs) {
              const s = y * xSegs + x;
              this.attributes.index.values.set(
                [i, i + 1 + xSegs, i + 1, i + 1, i + 1 + xSegs, i + 2 + xSegs],
                6 * s
              );
            }
          }
        }

        this.attributes.uv.update();
        this.attributes.uvNorm.update();
        this.attributes.index.update();
      }

      setSize(width = 1, height = 1) {
        this.width = width;
        this.height = height;
        this.attributes.position.values = new Float32Array(3 * this.vertexCount);

        const offsetX = width / -2;
        const offsetY = height / -2;
        const segWidth = width / this.xSegCount;
        const segHeight = height / this.ySegCount;

        for (let y = 0; y <= this.ySegCount; y++) {
          for (let x = 0; x <= this.xSegCount; x++) {
            const posX = offsetX + x * segWidth;
            const posY = offsetY + y * segHeight;
            const idx = y * (this.xSegCount + 1) + x;

            this.attributes.position.values[3 * idx] = posX;
            this.attributes.position.values[3 * idx + 1] = -posY;
            this.attributes.position.values[3 * idx + 2] = 0;
          }
        }

        this.attributes.position.update();
      }
    };

    this.Mesh = class {
      constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.attributeInstances = [];

        Object.entries(geometry.attributes).forEach(([name, attribute]) => {
          this.attributeInstances.push({
            attribute,
            location: attribute.attach(name, material.program),
          });
        });

        self.meshes.push(this);
      }

      draw() {
        gl.useProgram(this.material.program);

        this.material.uniformInstances.forEach(({ uniform, location }) =>
          uniform.update(location)
        );

        this.attributeInstances.forEach(({ attribute, location }) =>
          attribute.use(location)
        );

        gl.drawElements(
          gl.TRIANGLES,
          this.geometry.attributes.index.values.length,
          gl.UNSIGNED_SHORT,
          0
        );
      }
    };

    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    this.meshes = [];
    this.commonUniforms = {
      projectionMatrix: new this.Uniform({ type: "mat4", value: identity }),
      modelViewMatrix: new this.Uniform({ type: "mat4", value: identity }),
      resolution: new this.Uniform({ type: "vec2", value: [1, 1] }),
      aspectRatio: new this.Uniform({ value: 1 }),
    };
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.commonUniforms.resolution.value = [width, height];
    this.commonUniforms.aspectRatio.value = width / height;
  }

  setOrthographicCamera() {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0,
      0, 2 / this.height, 0, 0,
      0, 0, -0.001, 0,
      0, 0, 0, 1,
    ];
  }

  render() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.meshes.forEach((mesh) => mesh.draw());
  }
}

class Gradient {
  constructor(canvas, colors) {
    this.canvas = canvas;
    this.colors = colors;
    this.minigl = new MiniGl(canvas);
    this.time = 0;
    this.last = 0;
    this.animationId = null;
    this.isPlaying = false;
    this.init();
  }

  init() {
    const sectionColors = this.colors.map((hex) =>
      normalizeColor(parseInt(hex.replace("#", "0x"), 16))
    );

    const uniforms = {
      u_time: new this.minigl.Uniform({ value: 0 }),
      u_shadow_power: new this.minigl.Uniform({ value: 6 }),
      u_darken_top: new this.minigl.Uniform({ value: 0 }),
      u_active_colors: new this.minigl.Uniform({
        value: [1, 1, 1, 1],
        type: "vec4",
      }),
      u_global: new this.minigl.Uniform({
        value: {
          noiseFreq: new this.minigl.Uniform({
            value: [0.0001, 0.0005],
            type: "vec2",
          }),
          noiseSpeed: new this.minigl.Uniform({ value: 0.000008 }),
        },
        type: "struct",
      }),
      u_vertDeform: new this.minigl.Uniform({
        value: {
          incline: new this.minigl.Uniform({ value: 0.25 }),
          offsetTop: new this.minigl.Uniform({ value: -0.5 }),
          offsetBottom: new this.minigl.Uniform({ value: -0.5 }),
          noiseFreq: new this.minigl.Uniform({ value: [3, 4], type: "vec2" }),
          noiseAmp: new this.minigl.Uniform({ value: 110 }),
          noiseSpeed: new this.minigl.Uniform({ value: 10 }),
          noiseFlow: new this.minigl.Uniform({ value: 3 }),
          noiseSeed: new this.minigl.Uniform({ value: 5 }),
        },
        type: "struct",
        excludeFrom: "fragment",
      }),
      u_baseColor: new this.minigl.Uniform({
        value: sectionColors[0],
        type: "vec3",
        excludeFrom: "fragment",
      }),
      u_waveLayers: new this.minigl.Uniform({
        value: [],
        excludeFrom: "fragment",
        type: "array",
      }),
    };

    for (let i = 1; i < sectionColors.length; i++) {
      uniforms.u_waveLayers.value.push(
        new this.minigl.Uniform({
          value: {
            color: new this.minigl.Uniform({
              value: sectionColors[i],
              type: "vec3",
            }),
            noiseFreq: new this.minigl.Uniform({
              value: [2 + i / sectionColors.length, 3 + i / sectionColors.length],
              type: "vec2",
            }),
            noiseSpeed: new this.minigl.Uniform({ value: 11 + 0.3 * i }),
            noiseFlow: new this.minigl.Uniform({ value: 6.5 + 0.3 * i }),
            noiseSeed: new this.minigl.Uniform({ value: 5 + 10 * i }),
            noiseFloor: new this.minigl.Uniform({ value: 0.1 }),
            noiseCeil: new this.minigl.Uniform({ value: 0.63 + 0.07 * i }),
          },
          type: "struct",
        })
      );
    }

    const vertexShader = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 blendNormal(vec3 base, vec3 blend, float opacity) {
  return blend * opacity + base * (1.0 - opacity);
}

varying vec3 v_color;

void main() {
  float time = u_time * u_global.noiseSpeed;
  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;
  float tilt = resolution.y / 2.0 * uvNorm.y;
  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;
  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);

  float noise = snoise(vec3(
    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,
    noiseCoord.y * u_vertDeform.noiseFreq.y,
    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed
  )) * u_vertDeform.noiseAmp;

  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
  noise = max(0.0, noise);

  vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);
  v_color = u_baseColor;

  for (int i = 0; i < u_waveLayers_length; i++) {
    if (u_active_colors[i + 1] == 1.) {
      WaveLayers layer = u_waveLayers[i];
      float layerNoise = smoothstep(
        layer.noiseFloor,
        layer.noiseCeil,
        snoise(vec3(
          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,
          noiseCoord.y * layer.noiseFreq.y,
          time * layer.noiseSpeed + layer.noiseSeed
        )) / 2.0 + 0.5
      );
      v_color = blendNormal(v_color, layer.color, pow(layerNoise, 4.));
    }
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

    const fragmentShader = `
varying vec3 v_color;

void main() {
  vec3 color = v_color;
  if (u_darken_top == 1.0) {
    vec2 st = gl_FragCoord.xy / resolution.xy;
    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

    const material = new this.minigl.Material(vertexShader, fragmentShader, uniforms);
    const geometry = new this.minigl.PlaneGeometry();
    this.mesh = new this.minigl.Mesh(geometry, material);

    this.resize();
    this.handleResize = () => this.resize();
    window.addEventListener("resize", this.handleResize);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.minigl.setSize(width, height);
    this.minigl.setOrthographicCamera();

    this.mesh.geometry.setTopology(
      Math.ceil(width * 0.02),
      Math.ceil(height * 0.05)
    );
    this.mesh.geometry.setSize(width, height);
  }

  animate = (timestamp) => {
    if (!this.isPlaying) return;
    this.time += Math.min(timestamp - this.last, 1000 / 15);
    this.last = timestamp;
    this.mesh.material.uniforms.u_time.value = this.time;
    this.minigl.render();
    this.animationId = requestAnimationFrame(this.animate);
  };

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.last = 0;
    this.animationId = requestAnimationFrame(this.animate);
  }

  stop() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.handleResize);
    this.minigl.meshes = [];
  }
}

const DEFAULT_COLORS = Object.freeze([
  "#10243A", "#244B6A", "#6FAED2",
  "#193B59", "#A9D3E8", "#142B43"
]);

export default function GradientWave({
  colors = DEFAULT_COLORS,
  isPlaying = true,
  className = "",
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });

    container.appendChild(canvas);

    let gradient;

    try {
      gradient = new Gradient(canvas, colors);
      if (isPlaying) gradient.start();
    } catch (error) {
      console.error("Failed to initialize gradient:", error);
    }

    return () => {
      gradient?.stop();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [colors, isPlaying]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`gradient-wave-background ${className}`}
    />
  );
}
