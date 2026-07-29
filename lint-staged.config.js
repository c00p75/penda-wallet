export default {
  'apps/web/**/*.{ts,tsx}': () => 'npm run lint --workspace=apps/web',
  'apps/mobile/**/*.{ts,tsx}': () => 'npm run lint --workspace=apps/mobile',
  'packages/money-core/**/*.ts': () => 'npm run lint --workspace=@penda/money-core',
}
