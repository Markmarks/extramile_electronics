import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

// Anchor content globs to this file's directory (forward slashes for fast-glob),
// so class scanning works regardless of the process CWD the dev server is launched with.
const here = path.dirname(fileURLToPath(import.meta.url));
const glob = (p: string) => path.resolve(here, p).replace(/\\/g, '/');

// Same token mapping as apps/web so both surfaces read as one product.
const config: Config = {
  darkMode: 'class',
  content: [
    glob('index.html'),
    glob('src/**/*.{ts,tsx}'),
    glob('../../packages/ui/src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
