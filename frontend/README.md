# Agentonchain frontend

A local login prototype built with Next.js. After login, a sidebar opens a Chat workspace and a Deploy view with the Agentonchain assistant card.

## Run locally

```sh
bun install
bun run dev
```

Open http://localhost:3000. Sign in with username `demo` and password `demo123`.

The form supports required fields, invalid-credential feedback, password visibility, a workspace after successful login, and sign-out. Chat has a growing message input, Enter to send, Shift+Enter for a new line, and a local message history. Messages and drafts survive switching between Chat and Deploy. Deploy shows only the primary local backend agent, Agentonchain assistant, with its name, description, developer, skills, endpoint URL, unconfigured pricing, and review status. Each agent is shown in a card with skill badges, input/output price panels, a rating, and an expandable details area for its endpoint, identity, and payment mode. Deploy imports its CSS module directly so its styles load with the component. Next.js handles CSS natively; the previous custom loader forced `.module.css` files to plain CSS and prevented module styles from matching. The UI uses plain CSS, so it does not need Tailwind directives or a custom CSS loader. Explore supports local search by name, description, developer, and skills. Fixtures are in `src/lib/mock-agents.ts`. AI responses, live deployment, endpoint calls, and payments are not connected. Signing out clears the workspace. Login state is held in memory and resets on reload. The public demo credentials are defined in `src/lib/mock-auth.ts`; they provide no real authentication or access control.

## Checks

```sh
bun run lint
bunx --no-install tsc --noEmit
bun run build
```

## Pending Lime setup

The environment used for the initial login implementation could not resolve the package registry or `design.how`. The UI applies the available guidance in `../system/lime.md`: a white page with warm-grey surfaces, lime reserved for the main action, sentence-case copy, visible field labels, larger controls, and keyboard focus rings. The root has the `lime` scope, and styles use the role names documented in that guide.

The official components, `LimePortalProvider`, foundation token tables, and Lime lint remain unavailable. Role names currently map to the existing prototype palette; these mappings are not verified official Lime values. No stand-in components are presented as official Lime components. Token prices use a local `formatAmount` helper with up to eight decimal places so small rates remain visible, pending the official Amount component. Complete the installation and UI review required by `AGENTS.md`, replace the temporary styles with Lime components and tokens, and run the Lime lint before treating the design-system setup as finished.

The Agentonchain assistant card uses the session endpoint on port 2000. Start its backend server using the commands in `../backend/README.md`. Its prices are unconfigured and it has no reviews yet; listing it does not check whether it is running.
