import {Form, Input} from 'antd';
import type {ReactElement} from 'react';
import {useUserDetailStore, type UserDetail} from '@/stores/user-detail';

interface FormFieldProps {
  label: string;
  field: keyof UserDetail;
  value?: string;
}

/**
 * The renderer's `events` mechanism drops event arguments — `() => dispatch(...)`
 * at packages/renderer/src/react.tsx:155 ignores anything the input passes back.
 * To get a typed `(field, value)` mutation flow, this component reaches into
 * the zustand store directly, completely bypassing the schema's events DSL.
 *
 * That bypass is the gap: a renderer expressive enough to declare two-way
 * binding would let the schema do this. Today it cannot.
 */
export function FormField({label, field, value}: FormFieldProps): ReactElement {
  const setField = useUserDetailStore(s => s.setField);
  return (
    <Form.Item label={label} style={{marginBottom: 12}}>
      <Input
        value={value ?? ''}
        onChange={e => setField(field, e.target.value)}
        placeholder={`请输入${label}`}
      />
    </Form.Item>
  );
}
