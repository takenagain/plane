import { autoUpdate, computePosition, flip, shift } from "@floating-ui/react-dom";
import type { Placement } from "@floating-ui/react-dom";
import { useEffect, useLayoutEffect, useState } from "react";

export type { Placement };

interface UsePopperOptions {
  placement?: Placement;
  strategy?: "fixed" | "absolute";
  modifiers?: Array<{ name: string; options?: Record<string, unknown> }>;
}

type PopperStyles = {
  position: "fixed" | "absolute";
  left: 0;
  top: 0;
  transform?: string;
};

// Avoid the SSR "useLayoutEffect does nothing on the server" warning while still
// positioning synchronously before paint on the client (prevents a flash at 0,0).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Drop-in replacement for react-popper's usePopper, built on @floating-ui's vanilla
 * computePosition + autoUpdate. react-popper 2.x is incompatible with React 19; this
 * shim preserves the same call signature `(reference, popper, options)` and the same
 * `{ styles: { popper }, attributes: { popper } }` return shape so existing call sites
 * only need an import change.
 *
 * Uses computePosition directly (rather than the useFloating hook's `elements` option,
 * which did not reactively reposition when the floating element mounts lazily) so the
 * panel is positioned next to its reference as soon as both elements exist.
 */
export function usePopper(
  referenceElement: Element | null | undefined,
  popperElement: HTMLElement | null | undefined,
  options: UsePopperOptions = {}
) {
  const { placement = "bottom-start", strategy = "fixed" } = options;

  const [styles, setStyles] = useState<PopperStyles>({ position: strategy, left: 0, top: 0 });
  const [computedPlacement, setComputedPlacement] = useState<Placement>(placement);

  useIsomorphicLayoutEffect(() => {
    if (!referenceElement || !popperElement) return;

    const update = () => {
      computePosition(referenceElement, popperElement, {
        placement,
        strategy,
        middleware: [flip(), shift({ padding: 8 })],
      }).then(({ x, y, placement: nextPlacement }) => {
        setStyles({
          position: strategy,
          left: 0,
          top: 0,
          transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`,
        });
        setComputedPlacement(nextPlacement);
      });
    };

    // autoUpdate runs `update` immediately and on scroll/resize/layout shifts.
    return autoUpdate(referenceElement, popperElement, update);
  }, [referenceElement, popperElement, placement, strategy]);

  return {
    styles: { popper: styles },
    attributes: { popper: { "data-popper-placement": computedPlacement } },
  };
}
