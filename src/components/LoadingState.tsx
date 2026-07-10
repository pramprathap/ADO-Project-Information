import { Spinner } from '@fluentui/react-components';

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading project information…' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '240px',
        padding: '48px',
      }}
    >
      <Spinner label={label} />
    </div>
  );
}
