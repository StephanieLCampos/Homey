/**
 * IMAGE TYPE DECLARATIONS - TypeScript module declarations for image file imports
 * Enables TypeScript to recognize and import image files (png, jpg, jpeg, gif, svg).
 * Provides type safety for image imports throughout the React application.
 * Allows webpack to process image files and return proper string paths for src attributes.
 * Essential for proper TypeScript compilation with static asset imports.
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