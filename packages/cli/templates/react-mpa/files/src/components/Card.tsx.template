import type {ReactElement, ReactNode} from 'react';

interface CardProps {
  title?: string;
  children?: ReactNode;
}

export function Card({title, children}: CardProps): ReactElement {
  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '12px 16px',
        margin: '12px 0',
        background: '#fff'
      }}
    >
      {title ? <header style={{fontWeight: 600, marginBottom: 8}}>{title}</header> : null}
      <div>{children}</div>
    </section>
  );
}
