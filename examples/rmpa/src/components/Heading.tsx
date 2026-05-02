import type {ReactElement} from 'react';

interface HeadingProps {
  level?: number;
  text?: string;
}

export function Heading({level = 1, text}: HeadingProps): ReactElement {
  switch (level) {
    case 2: return <h2>{text}</h2>;
    case 3: return <h3>{text}</h3>;
    default: return <h1>{text}</h1>;
  }
}
