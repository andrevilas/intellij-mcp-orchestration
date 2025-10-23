import { readFile } from 'node:fs/promises';

const CSS_PATH = new URL('../app/src/styles/index.scss', import.meta.url);

function extractBlock(source, selector) {
  const start = source.indexOf(selector);
  if (start === -1) {
    throw new Error(`Selector ${selector} not found`);
  }
  let i = start + selector.length;
  while (i < source.length && source[i] !== '{') {
    i += 1;
  }
  if (source[i] !== '{') {
    throw new Error(`Opening brace not found for ${selector}`);
  }
  let depth = 0;
  let blockStart = -1;
  for (; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
      if (depth === 1) {
        blockStart = i + 1;
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(blockStart, i);
      }
    }
  }
  throw new Error(`Closing brace not found for ${selector}`);
}

function parseTokens(block) {
  const cleaned = block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const tokens = {};
  for (const segment of cleaned.split(';')) {
    const line = segment.trim();
    if (!line.startsWith('--')) {
      continue;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const name = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (name && value) {
      tokens[name] = value;
    }
  }
  return tokens;
}

function parseHex(value) {
  const hex = value.replace('#', '');
  const normalized = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const int = parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
    a: 1,
  };
}

function parseNumber(value) {
  return Number.parseFloat(value.replace('%', '')) / 100;
}

function parseRgba(value) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    throw new Error(`Invalid rgba value: ${value}`);
  }
  const parts = match[1]
    .split(',')
    .map((part) => part.trim())
    .map((part, index) => (index < 3 ? Number.parseFloat(part) : Number.parseFloat(part)));
  const [r, g, b, a = 1] = parts;
  return { r, g, b, a };
}

function splitTopLevel(input, separator) {
  const segments = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    }
    if (char === separator && depth === 0) {
      segments.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function composite(fg, bg) {
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
    a: alpha,
  };
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

function createResolver(baseTokens) {
  const cache = new Map();

  function resolveValue(raw, themeTokens, baseThemeTokens, stack) {
    const value = raw.trim();
    if (value.startsWith('var(')) {
      const varMatch = value.match(/var\(--([^\s)]+)\)/);
      if (!varMatch) {
        throw new Error(`Unable to parse var in ${value}`);
      }
      const tokenName = `--${varMatch[1]}`;
      return resolveToken(tokenName, themeTokens, baseThemeTokens, stack);
    }
    if (value.startsWith('#')) {
      return parseHex(value);
    }
    if (/^rgba?\(/i.test(value)) {
      return parseRgba(value);
    }
    if (value === 'transparent') {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (value.startsWith('color-mix')) {
      const inner = value.slice(value.indexOf(',') + 1, -1);
      const parts = splitTopLevel(inner, ',');
      const samples = parts.map((segment) => {
        const match = segment.trim().match(/(.+)\s+([\d.]+)%$/);
        if (!match) {
          throw new Error(`Unable to parse color-mix part: ${segment}`);
        }
        const [, colorExpr, percentValue] = match;
        const percent = parseNumber(percentValue);
        const color = resolveValue(colorExpr.trim(), themeTokens, baseThemeTokens, stack);
        return { color, weight: percent };
      });
      const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
      if (totalWeight === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      let accumA = 0;
      let accumR = 0;
      let accumG = 0;
      let accumB = 0;
      for (const { color, weight } of samples) {
        const factor = weight / totalWeight;
        const contribAlpha = color.a * factor;
        accumA += contribAlpha;
        accumR += (color.r / 255) * contribAlpha;
        accumG += (color.g / 255) * contribAlpha;
        accumB += (color.b / 255) * contribAlpha;
      }
      if (accumA === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      return {
        r: (accumR / accumA) * 255,
        g: (accumG / accumA) * 255,
        b: (accumB / accumA) * 255,
        a: accumA,
      };
    }
    if (/^[\d.]+$/.test(value)) {
      return { r: 0, g: 0, b: 0, a: Number.parseFloat(value) };
    }
    if (/^-?[\d.]+px$/.test(value)) {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
    throw new Error(`Unsupported value: ${value}`);
  }

  function resolveToken(name, themeTokens, baseThemeTokens, stack = new Set()) {
    const cacheKey = `${name}|${themeTokens === baseTokens ? 'light' : 'dark'}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    if (stack.has(cacheKey)) {
      throw new Error(`Circular token reference detected for ${name}`);
    }
    stack.add(cacheKey);
    const raw = Object.prototype.hasOwnProperty.call(themeTokens, name)
      ? themeTokens[name]
      : baseThemeTokens[name];
    if (raw === undefined) {
      throw new Error(`Token ${name} not defined`);
    }
    const resolved = resolveValue(raw, themeTokens, baseThemeTokens, stack);
    stack.delete(cacheKey);
    cache.set(cacheKey, resolved);
    return resolved;
  }

  return resolveToken;
}

function toFixed(value, digits = 2) {
  return Number.parseFloat(value.toFixed(digits));
}

function formatColor({ r, g, b }) {
  const rr = Math.round(r).toString(16).padStart(2, '0');
  const gg = Math.round(g).toString(16).padStart(2, '0');
  const bb = Math.round(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

const combos = [
  {
    theme: 'light',
    label: 'KPI Loading Text',
    text: '--mcp-state-fg-loading',
    background: '--mcp-state-surface-loading',
  },
  {
    theme: 'light',
    label: 'KPI Empty Text',
    text: '--mcp-state-fg-empty',
    background: '--mcp-state-surface-empty',
  },
  {
    theme: 'light',
    label: 'KPI Error Text',
    text: '--mcp-state-fg-error',
    background: '--mcp-state-surface-error',
  },
  {
    theme: 'light',
    label: 'Muted Status Loading',
    text: '--mcp-status-muted-loading',
    background: '--mcp-status-surface-loading',
  },
  {
    theme: 'dark',
    label: 'KPI Loading Text (Dark)',
    text: '--mcp-state-fg-loading',
    background: '--mcp-state-surface-loading',
  },
  {
    theme: 'dark',
    label: 'KPI Empty Text (Dark)',
    text: '--mcp-state-fg-empty',
    background: '--mcp-state-surface-empty',
  },
  {
    theme: 'dark',
    label: 'Muted Status Loading (Dark)',
    text: '--mcp-status-muted-loading',
    background: '--mcp-status-surface-loading',
  },
];

async function main() {
  const cssContent = await readFile(CSS_PATH, 'utf8');
  const lightBlock = extractBlock(cssContent, ':root');
  const darkBlock = extractBlock(cssContent, "[data-theme='dark']");
  const lightTokens = parseTokens(lightBlock);
  const darkOverrides = parseTokens(darkBlock);
  const darkTokens = { ...lightTokens, ...darkOverrides };
  const resolve = createResolver(lightTokens);

  const reports = [];
  for (const combo of combos) {
    const themeTokens = combo.theme === 'light' ? lightTokens : darkTokens;
    const baseThemeTokens = combo.theme === 'light' ? lightTokens : darkTokens;
    const background = resolve(combo.background, themeTokens, baseThemeTokens);
    const baseSurface = resolve('--mcp-surface', themeTokens, baseThemeTokens);
    const effectiveBackground = background.a < 1
      ? composite(background, baseSurface)
      : background;
    const rawText = resolve(combo.text, themeTokens, baseThemeTokens);
    const textColor = rawText.a < 1
      ? composite(rawText, effectiveBackground)
      : rawText;
    const ratio = contrastRatio(textColor, effectiveBackground);
    reports.push({
      theme: combo.theme,
      label: combo.label,
      ratio: toFixed(ratio, 2),
      text: formatColor(textColor),
      background: formatColor(effectiveBackground),
    });
  }

  console.log('Contrast report');
  console.log('---------------');
  for (const report of reports) {
    console.log(
      `${report.theme}\t${report.label}\t${report.ratio}\ttext=${report.text}\tbackground=${report.background}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
