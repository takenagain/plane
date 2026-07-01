// Rolldown (Vite 8) does not surface symbols through @popperjs/core's barrel re-exports.
// Blueprint imports `placements` from the package root; this shim re-exports from source files.
export * from "@popperjs/core-original/lib/enums.js";
export * from "@popperjs/core-original/lib/modifiers/index.js";
export {
  popperGenerator,
  detectOverflow,
  createPopper as createPopperBase,
} from "@popperjs/core-original/lib/createPopper.js";
export { createPopper } from "@popperjs/core-original/lib/popper.js";
export { createPopper as createPopperLite } from "@popperjs/core-original/lib/popper-lite.js";
