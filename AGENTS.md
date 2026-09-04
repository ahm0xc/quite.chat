## Database with Drizzle

- When generating database migrations, use descriptive names: `vp run db:generate --name <descriptive_name>`. Never use auto-generated names.

## Using Vite+

- For build-in commands use vp <name> and to run scripts use vp run <name>
- Run `vp check` to find any linting and formatting errors (run this after any implementation). And fix the errors and warnings you find.

## React

- Make sure to never extract and import something from 'react' package. Rather import every thing like this `import * as React from 'react'` and then use the needed things like this `React.useState`, `React.useEffect`, `React.useRef`, `React.useMemo` and so on.
- For types from the 'react' package, import them directly with a separate type import like this `import type { ReactNode } from 'react'` and use them without the `React.` prefix (e.g. `ReactNode`, not `React.ReactNode`).
- Use proper ordering for hooks and variables in a component in the following order below
  - React hooks like `useState` then `useRef`
  - Gap (separator)
  - Other hooks like `useTRPC`, `useUtils` or our custom hooks like `useMobile` and such
  - Gap (separator)
  - Then add functions or `useCallback`
  - Gap (separator)
  - then we will have all the `useEffects`
  - Gap (separator)
  - Then there will be things like variable that are driven from state, like `const isDisabled = !isLoading || !isReady` or such

## Misc

- when we need to access anything from the env we will use env.ts and if we add any value to `env.ts` then we should also add it to .env.example
