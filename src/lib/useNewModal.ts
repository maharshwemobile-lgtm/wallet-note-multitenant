"use client";

import { useEffect, useState } from "react";

/** Drop-in replacement for `useState(false)` on a page's create modal.
 *
 *  The floating "+" sends the user to the current section with `?new=1`, and the page
 *  opens its own create form. Reading the URL directly rather than through
 *  useSearchParams keeps every page statically rendered — useSearchParams would force a
 *  Suspense boundary and dynamic rendering on a dozen pages that otherwise need neither.
 */
export function useNewModal(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Deferred a tick so the open is a normal update rather than one during mount.
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("new") === "1") setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return [open, setOpen];
}
