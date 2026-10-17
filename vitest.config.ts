import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Shared workspace aliases so tests always resolve package sources directly. */
export const conaiAliases = {
  '@conai/ui': r('./packages/ui/src/index.ts'),
  '@conai/shared': r('./packages/shared/src/index.ts'),
  '@conai/database': r('./packages/database/src/index.ts'),
  '@conai/sparks': r('./packages/sparks/src/index.ts'),
  '@conai/permissions': r('./packages/permissions/src/index.ts'),
  '@conai/ai': r('./packages/ai/src/index.ts'),
  '@conai/auth': r('./packages/auth/src/index.ts'),
  '@conai/storage': r('./packages/storage/src/index.ts'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'sparks',
          root: './packages/sparks',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'permissions',
          root: './packages/permissions',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'storage',
          root: './packages/storage',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'auth',
          root: './packages/auth',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: conaiAliases },
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
