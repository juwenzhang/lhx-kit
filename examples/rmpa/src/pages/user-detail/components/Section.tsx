import {Card} from 'antd';
import type {ReactElement, ReactNode} from 'react';

interface SectionProps {
  title?: string;
  children?: ReactNode;
}

export function Section({title, children}: SectionProps): ReactElement {
  return (
    <Card size="small" title={title} style={{marginBottom: 12}}>
      {children}
    </Card>
  );
}
