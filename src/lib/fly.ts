"use client";

/** Little "added to cart" flight: the product photo shrinks into the cart button, which then bounces. */
export function flyToCart(from: Element | null, image?: string): void {
  try {
    if (!from || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const to = document.querySelector('[data-testid="cart-btn"]');
    if (!to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const size = 44;
    const el = document.createElement(image ? "img" : "div");
    if (image) (el as HTMLImageElement).src = image;
    Object.assign(el.style, {
      position: "fixed",
      left: `${a.left + a.width / 2 - size / 2}px`,
      top: `${a.top + a.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "12px",
      objectFit: "contain",
      background: "white",
      boxShadow: "0 6px 18px rgba(0,0,0,.2)",
      zIndex: "60",
      pointerEvents: "none",
    });
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const fly = el.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.8)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.4 },
      ],
      { duration: 650, easing: "cubic-bezier(.4,0,.2,1)" },
    );
    fly.onfinish = () => {
      el.remove();
      to.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
    };
  } catch {
    /* decoration only */
  }
}
