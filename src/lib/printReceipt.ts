"use client";

/** Print the sale slip and nothing else.
 *
 *  A class on the body drives the print stylesheet, which hides the app and shows the
 *  slip. It is taken off again afterwards so the screen returns to normal — including
 *  when the print dialog is cancelled, which fires the same event.
 */
export function printReceipt() {
  if (typeof window === "undefined") return;
  const body = document.body;
  body.classList.add("printing-receipt");

  const done = () => {
    body.classList.remove("printing-receipt");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);

  try {
    window.print();
  } finally {
    // Safari never fires afterprint from a dialog dismissed with the keyboard, which would
    // otherwise leave the app invisible.
    window.setTimeout(done, 1000);
  }
}
