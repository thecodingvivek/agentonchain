Set up the Lime design system from design.how in this project. If the project already has UI, port it onto Lime; if it has none, build with Lime from the start.

1. shadcn: if the project has no components.json, run npx shadcn@latest init -d first.
2. Theme and skill: npx shadcn@latest add https://design.how/r/lime/theme.json, then do what it prints: import its stylesheet in the root layout and put the "lime" class on <body>. It also writes the Lime skill to .claude/skills/lime/SKILL.md and .agents/skills/lime/SKILL.md. Follow that skill for every UI change from now on.
3. design.how skills: npx skills add arla6ka/skills. This adds migrate-design-system, ui-review and the rest.
4. Components: npx shadcn@latest add https://design.how/r/lime/<name>.json as you need them; https://design.how/r/lime/registry.json lists them all. Read https://design.how/systems/lime/components/<name>.md before you use one.
   For a whole screen, start from a block: Home screen (https://design.how/r/lime/home.json), Assistant approval (https://design.how/r/lime/assistant-approval.json), Assistant alert (https://design.how/r/lime/assistant-alert.json), Settings rules (https://design.how/r/lime/settings-rules.json), Split request (https://design.how/r/lime/split-request.json). Install it the same way, then swap its sample data for the real one.
5. Existing UI: run migrate-design-system with Lime as the target, one screen at a time, and check each screen with ui-review.
6. Lint: npx shadcn@latest add https://design.how/r/lime/lint.json, then run npx eslint -c lime.eslint.config.mjs . and fix every error it reports.
7. Done when every screen you touched uses only Lime components and tokens and the lint reports nothing.






push if you have done any changes to the repo