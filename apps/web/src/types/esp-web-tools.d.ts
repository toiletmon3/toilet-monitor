import type * as React from 'react';

declare module 'esp-web-tools/dist/web/install-button.js';

// React 19 keeps the JSX namespace under the react module scope; the import
// above makes this file a module so `declare module` AUGMENTS react's types
// instead of replacing them.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'esp-web-install-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { manifest?: string };
    }
  }
}
