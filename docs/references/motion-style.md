# Fenya Stream Lab — Motion Style Reference

Use this file when adding animations or micro-interactions.

## General principle

Animations should make the product feel smoother and more premium.
They should not make the dashboard harder to read.

## Allowed motion

Use:
- fade + slide-up section reveal;
- subtle card hover lift;
- subtle button press state;
- soft dropdown open/close animation;
- left rail fade/slide after Hero;
- word cloud soft reveal;
- archive book hover lift.

## Motion values

Recommended values:
- reveal distance: 12px to 24px;
- reveal duration: 450ms to 700ms;
- hover lift: -2px;
- button press scale: 0.98 or translateY(1px);
- easing: ease-out or cubic-bezier(0.16, 1, 0.3, 1).

## Avoid

Do not use:
- huge scale effects;
- bouncing;
- fast chaotic movement;
- infinite animations on important data cards;
- strong glare;
- large white shine strips;
- animations that cause layout shifts.

## Reduced motion

Always respect prefers-reduced-motion.

In reduced motion:
- disable large transforms;
- remove long transitions;
- keep content visible.

## Implementation preference

First choice:
- CSS transitions and reveal classes.

Second choice:
- Motion library, but only for focused tasks.

Do not install Motion for tiny CSS-only fixes.
Do not add GSAP unless explicitly requested.
Do not add WebGL or shader effects unless explicitly requested.
