import type {ReactElement} from 'react';

interface ParagraphProps {
  text?: string;
}

export function Paragraph({text}: ParagraphProps): ReactElement {
  return <p>{text}</p>;
}
