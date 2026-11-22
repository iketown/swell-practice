"use client";

import { useEffect, useId, useRef } from "react";

import styles from "./home-wave-logo.module.css";

const sceneWidth = 1200;
const sceneHeight = 260;
const turn = Math.PI * 2;
const stripeGap = 3;
const stripeColors = ["#b8cdaa", "#e8b64a", "#de6243", "#73b2ae", "#165d62"];

// The public site's two footer waves, reframed inside the homepage logo.
const waveLayers = [
  {
    name: "back",
    width: 4000,
    height: 500,
    viewHeight: 244,
    x: -24,
    y: 281,
    rotation: -3,
    speed: 1.1,
    amplitude: 42,
    opacity: 0.24,
    grainOpacity: 0.8,
    scale: 1.25,
    yOffset: -109,
    wavelength: 940,
    thickness: 28,
    phase: 132,
    period: 30,
    direction: "left",
    swell: { amplitude: 17, wavelength: 960, phase: 44, stagger: 66, period: 12 },
    grain: { seed: 19, contrast: 20 },
  },
  {
    name: "front",
    width: 5760,
    height: 275,
    viewHeight: 271,
    x: 18,
    y: 138,
    rotation: 3,
    speed: 1.3,
    amplitude: 35,
    opacity: 1,
    grainOpacity: 0.71,
    scale: 1.1,
    yOffset: -31,
    wavelength: 760,
    thickness: 27,
    phase: 18,
    period: 20,
    direction: "right",
    swell: { amplitude: 3.5, wavelength: 520, phase: 210, stagger: 54, period: 8 },
    grain: { seed: 7, contrast: 13.8 },
  },
] as const;

type Wave = (typeof waveLayers)[number];

function waveTransform(wave: Wave) {
  const { scale, yOffset } = wave;
  const left = sceneWidth / 2 + (wave.x - wave.width / 2) * scale;
  const top = sceneHeight + (wave.y - wave.height) * scale + yOffset;
  return `translate(${left} ${top}) scale(${scale}) rotate(${wave.rotation} ${wave.width / 2} ${wave.height / 2}) scale(1 ${wave.height / wave.viewHeight})`;
}

function bandPaths(wave: Wave, seconds: number) {
  const direction = wave.direction === "left" ? 1 : -1;
  const elapsed = seconds * wave.speed;
  const phase = (wave.phase / 360 + direction * elapsed / wave.period) * turn;
  const swellPhase = (wave.swell.phase / 360 - direction * elapsed / wave.swell.period) * turn;
  const stagger = wave.swell.stagger / 360 * turn;
  const bandHeight = stripeColors.length * (wave.thickness + stripeGap) - stripeGap;
  const baseline = (wave.viewHeight - bandHeight) / 2;
  const margin = 160;
  const visibleWidth = sceneWidth / wave.scale;
  const left = (wave.width - visibleWidth) / 2 - margin;
  const steps = Math.ceil((visibleWidth + 2 * margin) / 18);

  const samples = Array.from({ length: steps + 1 }, (_, index) => {
    const x = left + 18 * index;
    return {
      x,
      y: baseline + wave.amplitude * Math.sin(x / wave.wavelength * turn + phase),
      swellAngle: x / wave.swell.wavelength * turn + swellPhase,
    };
  });

  return stripeColors.map((_, band) => {
    const offset = band * (wave.thickness + stripeGap);
    const top: string[] = [];
    const bottom: string[] = [];
    for (const sample of samples) {
      const angle = sample.swellAngle + band * stagger;
      const crest = sample.y + offset + wave.swell.amplitude * Math.sin(angle);
      const trough = sample.y + offset + wave.thickness + wave.swell.amplitude * Math.sin(angle + stagger);
      top.push(`${sample.x} ${crest.toFixed(2)}`);
      bottom.push(`${sample.x} ${trough.toFixed(2)}`);
    }
    return `M${top.join("L")}L${bottom.reverse().join("L")}Z`;
  });
}

function WaveLayer({ wave }: { wave: Wave }) {
  const id = useId();
  const paths = bandPaths(wave, 0);
  const clip = `${id}-clip`;
  const grain = `${id}-grain`;
  const pattern = `${id}-pattern`;
  const contrast = wave.grain.contrast;
  const tile = 192;

  return (
    <g
      data-wave-layer={wave.name}
      opacity={wave.opacity}
      transform={waveTransform(wave)}
    >
      <defs>
        <clipPath id={clip}>
          {stripeColors.map((color, index) => <use key={color} href={`#${id}-${index}`} />)}
        </clipPath>
        <filter id={grain} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".48"
            numOctaves="2"
            seed={wave.grain.seed}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={contrast} intercept={0.5 - contrast * 0.5} />
            <feFuncG type="linear" slope={contrast} intercept={0.5 - contrast * 0.5} />
            <feFuncB type="linear" slope={contrast} intercept={0.5 - contrast * 0.5} />
          </feComponentTransfer>
          <feColorMatrix type="luminanceToAlpha" result="grain-alpha" />
          <feFlood floodColor="#fffdf8" floodOpacity=".34" />
          <feComposite in2="grain-alpha" operator="in" />
        </filter>
        <pattern id={pattern} width={tile} height={tile} patternUnits="userSpaceOnUse">
          <rect width={tile} height={tile} filter={`url(#${grain})`} />
        </pattern>
      </defs>
      {paths.map((path, index) => (
        <path key={stripeColors[index]} id={`${id}-${index}`} d={path} fill={stripeColors[index]} />
      ))}
      <rect
        data-wave-texture
        y={-wave.swell.amplitude}
        width={wave.width}
        height={wave.viewHeight + 2 * wave.swell.amplitude}
        clipPath={`url(#${clip})`}
        fill={`url(#${pattern})`}
        opacity={wave.grainOpacity}
      />
    </g>
  );
}

export function HomeWaveLogo() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const layers = waveLayers.map((wave) => ({
      wave,
      paths: svg.querySelectorAll<SVGPathElement>(`[data-wave-layer="${wave.name}"] > path`),
    }));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = typeof IntersectionObserver === "undefined";
    let frame: number | null = null;
    let lastDraw = 0;
    let seconds = 0;

    function render(now: number) {
      const elapsed = now - lastDraw;
      if (elapsed >= 1000 / 30) {
        seconds += Math.min(elapsed, 100) / 1000;
        lastDraw = now;
        for (const { wave, paths } of layers) {
          bandPaths(wave, seconds).forEach((path, index) => {
            paths[index].setAttribute("d", path);
          });
        }
      }
      frame = requestAnimationFrame(render);
    }

    function syncMotion() {
      if (visible && !document.hidden && !motion.matches) {
        if (frame === null) {
          lastDraw = performance.now();
          frame = requestAnimationFrame(render);
        }
      } else if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    }

    const observer = visible ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    });
    observer?.observe(svg);
    motion.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    syncMotion();

    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.logo} role="img" aria-label="The Swell, sounds of The Beach Boys">
      <svg
        ref={svgRef}
        className={styles.waves}
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
        viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
      >
        {waveLayers.map((wave) => <WaveLayer key={wave.name} wave={wave} />)}
      </svg>
    </div>
  );
}
