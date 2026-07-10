import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <MessageBar intent="error" politeness="assertive">
        <MessageBarBody>
          <MessageBarTitle>{title}</MessageBarTitle>
          {message}
        </MessageBarBody>
        {onRetry && (
          <MessageBarActions>
            <Button appearance="transparent" icon={<ArrowClockwiseRegular />} onClick={onRetry}>
              Retry
            </Button>
          </MessageBarActions>
        )}
      </MessageBar>
    </div>
  );
}
