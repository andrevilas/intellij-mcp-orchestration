import { useMemo } from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  type FieldError,
  type FieldErrors,
  type FieldValues,
  type Path,
  type RegisterOptions,
  type UseFormProps,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from 'react-hook-form';

export { FormProvider as McpFormProvider, useFormContext as useMcpFormContext };

export function useMcpForm<TFieldValues extends FieldValues = FieldValues>(
  options?: UseFormProps<TFieldValues>,
): UseFormReturn<TFieldValues> {
  return useForm<TFieldValues>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    shouldUseNativeValidation: false,
    ...options,
  });
}

export interface McpFieldOptions<TFieldValues extends FieldValues> {
  id?: string;
  descriptionId?: string;
  rules?: RegisterOptions<TFieldValues, Path<TFieldValues>>;
}

export interface McpFieldResult {
  inputProps: UseFormRegisterReturn & {
    id: string;
    'aria-invalid': 'true' | 'false';
    'aria-describedby'?: string;
  };
  error?: string;
  errorId?: string;
  isInvalid: boolean;
}

function isFieldError(value: unknown): value is FieldError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      'message' in value &&
      ('ref' in value || 'types' in value || 'type' in value),
  );
}

function getFieldError<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  name: string,
): FieldError | undefined {
  const segments = name.split('.');
  let current: unknown = errors;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return isFieldError(current) ? (current as FieldError) : undefined;
}

export function useMcpField<TFieldValues extends FieldValues = FieldValues>(
  name: Path<TFieldValues>,
  options: McpFieldOptions<TFieldValues> = {},
): McpFieldResult {
  const context = useFormContext<TFieldValues>();
  const fieldId = options.id ?? name.replace(/[^a-zA-Z0-9]+/g, '-');
  const registerResult = context.register(name, options.rules);
  const fieldError = getFieldError(context.formState.errors, name);
  const errorMessage = typeof fieldError?.message === 'string' ? fieldError.message : undefined;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;
  const describedBy = [options.descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const isInvalid = Boolean(fieldError);

  return {
    inputProps: {
      ...registerResult,
      id: fieldId,
      'aria-invalid': isInvalid ? 'true' : 'false',
      'aria-describedby': describedBy,
    },
    error: errorMessage,
    errorId,
    isInvalid,
  };
}

export interface FormErrorSummaryItem {
  name: string;
  message: string;
}

function flattenErrors<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  parent?: string,
  accumulator: FormErrorSummaryItem[] = [],
): FormErrorSummaryItem[] {
  for (const [key, value] of Object.entries(errors)) {
    if (!value) {
      continue;
    }
    const path = parent ? `${parent}.${key}` : key;
    if (isFieldError(value) && value.message) {
      accumulator.push({ name: path, message: String(value.message) });
      continue;
    }
    if (typeof value === 'object') {
      flattenErrors(value as FieldErrors<TFieldValues>, path, accumulator);
    }
  }
  return accumulator;
}

export function useFormErrorSummary<TFieldValues extends FieldValues = FieldValues>(): FormErrorSummaryItem[] {
  const { errors, submitCount, isSubmitted } = useFormState<TFieldValues>();
  return useMemo(() => {
    if (!isSubmitted && submitCount === 0) {
      return [];
    }
    return flattenErrors(errors);
  }, [errors, isSubmitted, submitCount]);
}
