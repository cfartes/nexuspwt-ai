'use client';
import { useId, useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id || generatedId;
  const label = visible ? 'Ocultar senha' : 'Mostrar senha';
  return (
    <span className="password-input">
      <input {...props} id={id} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        aria-label={label}
        title={label}
        aria-pressed={visible}
        aria-controls={id}
        disabled={props.disabled}
        onClick={(event) => {
          event.preventDefault();
          setVisible((value) => !value);
        }}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </span>
  );
}
