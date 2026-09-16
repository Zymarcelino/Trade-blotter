/**
 * <TradeForm /> - the shared create/amend trade form.
 *
 * A single presentational form used by both {@link CreateTradeModal} and
 * {@link AmendTradeModal}, laid out as a two-column grid: Symbol | Side,
 * Quantity | Price, Trader | Book, then a full-width Counterparty (and Status
 * on amend). Side is a segmented BUY/SELL toggle; Trader, Book and Counterparty
 * are dropdowns populated from mock desk data ({@link formOptions}).
 *
 * Validation and accessibility follow the frontend and ux-best-practices
 * steering:
 *  - React Hook Form with `mode: 'onBlur'` + `reValidateMode: 'onChange'`.
 *  - `zodResolver` runs the shared create/amend schema so client rules mirror
 *    the backend.
 *  - Every control has an associated label (or an accessible group name for the
 *    Side toggle); required fields are marked with a visible asterisk and
 *    `aria-required`; error text is linked via `aria-describedby`.
 *  - The submit button is disabled while a mutation is in flight.
 *
 * The component owns form state only and delegates the API call to `onSubmit`;
 * it never closes itself or shows toasts.
 *
 * _Requirements: 10.2, 10.3, 10.5, 10.6, 11.2_
 */

import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { TradeSide, TradeStatus } from '../../types/trade.types';
import {
  amendTradeSchema,
  createTradeSchema,
  type AmendTradeFormValues,
  type CreateTradeFormValues,
} from '../../utils/tradeSchema';
import {
  BOOK_OPTIONS,
  COUNTERPARTY_OPTIONS,
  TRADER_OPTIONS,
} from './formOptions';
import styles from './TradeForm.module.css';

/** Which flavour of the form to render. */
export type TradeFormMode = 'create' | 'amend';

/** The union of possible validated form value shapes. */
export type TradeFormValues = CreateTradeFormValues | AmendTradeFormValues;

/** Props for {@link TradeForm}. */
export interface TradeFormProps {
  /** `create` (all fields required) or `amend` (fields optional + status). */
  readonly mode: TradeFormMode;
  /**
   * Called with the validated values when the form passes validation. The
   * parent performs the API call; this component does not.
   */
  readonly onSubmit: (values: TradeFormValues) => void;
  /** Optional field pre-population (used by the amend flow). */
  readonly defaultValues?: Partial<Record<keyof AmendTradeFormValues, unknown>>;
  /** True while the parent's mutation is in flight - disables the submit. */
  readonly isSubmitting?: boolean;
  /** Optional cancel handler - renders a Cancel button when provided. */
  readonly onCancel?: () => void;
  /**
   * Optional inline conflict message (e.g. a 409 on amend) rendered near the
   * submit area rather than as a toast.
   */
  readonly conflictMessage?: string | null;
}

export function TradeForm({
  mode,
  onSubmit,
  defaultValues,
  isSubmitting = false,
  onCancel,
  conflictMessage = null,
}: TradeFormProps): React.JSX.Element {
  const schema = mode === 'create' ? createTradeSchema : amendTradeSchema;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TradeFormValues>({
    resolver: zodResolver(schema) as Resolver<TradeFormValues>,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: defaultValues as Partial<TradeFormValues> | undefined,
  });

  const isAmend = mode === 'amend';
  // In create mode every field is required; in amend mode all are optional.
  const required = !isAmend;

  const errs = errors as Record<string, { message?: string } | undefined>;

  // Register `side` so RHF tracks/validates it; the segmented toggle drives its
  // value via setValue (there is no native <select> for side any more).
  register('side');
  const currentSide = watch('side') as string | undefined;

  function selectSide(value: string): void {
    setValue('side', value as TradeFormValues['side'], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  /** Shared a11y wiring for a control given its error state. */
  function fieldAria(name: string, hasError: boolean): {
    'aria-required': boolean;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  } {
    return {
      'aria-required': required,
      'aria-invalid': hasError,
      ...(hasError ? { 'aria-describedby': `${name}-error` } : {}),
    };
  }

  /** Inline error paragraph for a field, or nothing. */
  function fieldError(
    name: string,
    message: string | undefined,
  ): React.JSX.Element | null {
    if (!message) return null;
    return (
      <p id={`${name}-error`} className={styles.error} role="alert">
        {message}
      </p>
    );
  }

  /** A visible required-marker asterisk (decorative; aria-required carries state). */
  function requiredMark(): React.JSX.Element | null {
    if (!required) return null;
    return (
      <span className={styles.required} aria-hidden="true">
        {' '}*
      </span>
    );
  }

  /** Renders a labelled text input field. */
  function textField(
    name: 'symbol' | 'quantity' | 'price',
    label: string,
    placeholder: string,
    type: 'text' | 'number',
    step?: string,
  ): React.JSX.Element {
    const message = errs[name]?.message;
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={name}>
          {label}
          {requiredMark()}
        </label>
        <input
          id={name}
          type={type}
          step={step}
          className={`${styles.input} ${message ? styles.inputError : ''}`}
          placeholder={placeholder}
          {...register(name as keyof TradeFormValues)}
          {...fieldAria(name, Boolean(message))}
        />
        {fieldError(name, message)}
      </div>
    );
  }

  /** Renders a labelled dropdown field from a list of string options. */
  function selectField(
    name: 'trader' | 'book' | 'counterparty',
    label: string,
    placeholder: string,
    options: readonly string[],
    fullWidth = false,
  ): React.JSX.Element {
    const message = errs[name]?.message;
    return (
      <div className={fullWidth ? styles.fieldWide : styles.field}>
        <label className={styles.label} htmlFor={name}>
          {label}
          {requiredMark()}
        </label>
        <select
          id={name}
          className={`${styles.input} ${styles.select} ${message ? styles.inputError : ''}`}
          {...register(name as keyof TradeFormValues)}
          {...fieldAria(name, Boolean(message))}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {fieldError(name, message)}
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.grid}>
        {/* Row 1: Symbol | Side */}
        {textField('symbol', 'Symbol', 'AAPL', 'text')}

        <div className={styles.field} role="group" aria-label="Side">
          <span className={styles.label} id="side-label">
            Side
            {requiredMark()}
          </span>
          <div
            className={`${styles.segmented} ${errs.side?.message ? styles.inputError : ''}`}
            aria-describedby={errs.side?.message ? 'side-error' : undefined}
          >
            {[TradeSide.BUY, TradeSide.SELL].map((value) => {
              const active = currentSide === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`${styles.segment} ${
                    active
                      ? value === TradeSide.BUY
                        ? styles.segmentBuy
                        : styles.segmentSell
                      : ''
                  }`}
                  aria-pressed={active}
                  onClick={() => selectSide(value)}
                >
                  {value}
                </button>
              );
            })}
          </div>
          {fieldError('side', errs.side?.message)}
        </div>

        {/* Row 2: Quantity | Price */}
        {textField('quantity', 'Quantity', '1000', 'number')}
        {textField('price', 'Price', '227.45', 'number', '0.01')}

        {/* Row 3: Trader | Book */}
        {selectField('trader', 'Trader', 'Select trader', TRADER_OPTIONS)}
        {selectField('book', 'Book', 'Select book', BOOK_OPTIONS)}

        {/* Row 4: Counterparty (full width) */}
        {selectField(
          'counterparty',
          'Counterparty',
          'Select counterparty',
          COUNTERPARTY_OPTIONS,
          true,
        )}

        {/* Amend-only: Status (full width) */}
        {isAmend && (
          <div className={styles.fieldWide}>
            <label className={styles.label} htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className={`${styles.input} ${styles.select} ${errs.status?.message ? styles.inputError : ''}`}
              {...register('status')}
              {...fieldAria('status', Boolean(errs.status?.message))}
            >
              <option value="">Select status</option>
              <option value={TradeStatus.ACTIVE}>ACTIVE</option>
              <option value={TradeStatus.CANCELLED}>CANCELLED</option>
            </select>
            {fieldError('status', errs.status?.message)}
          </div>
        )}
      </div>

      {conflictMessage && (
        <p className={styles.conflict} role="alert">
          {conflictMessage}
        </p>
      )}

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.actions}>
        {onCancel && (
          <button
            type="button"
            className={styles.cancel}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isAmend ? 'Save Changes' : 'Submit Trade'}
        </button>
      </div>
    </form>
  );
}
