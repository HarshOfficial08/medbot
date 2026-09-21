import { registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Keys Mongo would interpret rather than store (see IntakeService), plus
 * the usual prototype-pollution names.
 */
const UNSAFE_KEY = /^\$|\.|^(?:__proto__|constructor|prototype)$/;

/** The value types an intake answer may take (see `IntakeFields`). */
function isIntakeFieldValue(value: unknown): boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Validates a free-form `Record<string, string | number | boolean |
 * string[]>` bag, which `@IsObject()` alone cannot: the global
 * ValidationPipe's whitelist does not reach inside an untyped object, so
 * without this an agent could post arbitrary nested structures — or a key
 * that rewrites part of the document — straight into a PHI collection.
 *
 * Note it never rejects a *missing* field: absence is a valid, meaningful
 * state here (the patient simply has not said it yet).
 */
export function IsIntakeFieldMap(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIntakeFieldMap',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
          }
          return Object.entries(value as Record<string, unknown>).every(
            ([key, entry]) =>
              key.length > 0 && !UNSAFE_KEY.test(key) && isIntakeFieldValue(entry),
          );
        },
        defaultMessage(args: ValidationArguments): string {
          // Names the property only — the values are patient-reported PHI
          // and must not be echoed into an error body or a log line.
          return `${args.property} must be an object mapping field names to a string, number, boolean or string array`;
        },
      },
    });
  };
}
