# Steering: UX Best Practices

- Every async surface renders one of loading / data / empty / error; errors are retryable.
- During a retry show both the loading state and the error banner.
- Feedback: success/error toasts on mutations; toasts are solid/opaque and legible.
- Disable submit controls while a mutation is in flight (prevent double submit).
- State is never conveyed by colour alone (cancelled = opacity + strikethrough; connection
  = colour + text).
- Format timestamps as human-readable local time, never raw ISO.
- Keep the blotter interactive during live updates (freeze the view when scrolled away).
