import {Alert} from 'antd';
import type {ReactElement} from 'react';

interface BannerProps {
  text: string;
  kind?: 'info' | 'error' | 'success';
}

export function Banner({text, kind = 'info'}: BannerProps): ReactElement {
  const type = kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info';
  return <Alert message={text} type={type} showIcon style={{marginBottom: 12}} />;
}
