/**
 * IMAGE MODULE DECLARATIONS
 *
 * Ambient declarations that let TypeScript accept `import img from './x.png'`.
 * Without them the compiler rejects the import, since it has no notion of a
 * non-code module.
 *
 * Each image is declared as exporting a string, which matches what webpack's
 * `asset/resource` loader actually substitutes at build time: the emitted file's
 * URL, ready to use as an `<img src>`.
 *
 * Connections:
 *   - client/webpack.config.js - the asset rule that makes this true at runtime.
 *   - client/src/images/       - the bundled default avatar and sample photo.
 *   - client/src/App.tsx, components/Profile.tsx, SwipeCard.tsx,
 *     Auth/RegisterForm.tsx - the importers.
 *
 * Note: declarations for .jpg, .jpeg, .gif and .svg are provided for
 * completeness; only .png files are currently imported.
 */
declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.gif" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}