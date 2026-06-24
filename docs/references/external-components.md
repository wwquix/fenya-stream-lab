# External UI References

Use external UI references carefully.

## 21st.dev

21st.dev can be used as a source of visual inspiration and component ideas.

Rules:
- Do not blindly copy components.
- Do not install Tailwind just because a reference uses Tailwind.
- Do not install shadcn just because a reference uses shadcn.
- Do not convert the project to TypeScript.
- Adapt the idea to the existing React + Vite + JavaScript + CSS stack.

When using a 21st.dev component as reference, extract:
- layout idea;
- spacing;
- animation behavior;
- hover behavior;
- premium feeling.

Do not automatically copy:
- Tailwind classes;
- shadcn structure;
- Radix components;
- TypeScript types;
- Next.js-specific code.

## shadcn / Tailwind references

Use as inspiration only unless the task explicitly says to integrate shadcn/Tailwind.

Good instruction:
“Use this as visual inspiration only. Adapt it to our existing JavaScript and CSS project.”

Bad instruction:
“Copy this component exactly.”

## Motion / Framer Motion

Motion can be added later for:
- section reveal;
- layout transitions;
- dropdown animations;
- archive book interactions;
- profile drawer animation.

Do not install Motion globally without a focused task.
Install it only when we are ready to animate one specific section.
