import {Button} from 'antd';
import type {ReactElement} from 'react';

interface ActionButtonProps {
  text: string;
  kind?: 'primary' | 'danger' | 'default';
  loading?: boolean;
  onClick?: () => void;
}

/**
 * Button with `onClick` matching the renderer's eventName→onName binding.
 * The walker turns schema `events.click` into a prop named `onClick` whose
 * value is `() => dispatchAction(...)` — so as long as the React component
 * accepts an `onClick: () => void` prop, the wiring is automatic.
 */
export function ActionButton({text, kind = 'default', loading, onClick}: ActionButtonProps): ReactElement {
  const type = kind === 'primary' ? 'primary' : 'default';
  const danger = kind === 'danger';
  return (
    <Button type={type} danger={danger} loading={loading} onClick={onClick} style={{marginRight: 8}}>
      {text}
    </Button>
  );
}
