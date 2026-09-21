import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BooleanQuery } from './boolean-query.decorator.js';

class QueryDto {
  @BooleanQuery()
  flag?: boolean;
}

function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(QueryDto, query, {
    // Mirrors the global pipe's settings, which is where the bug lives.
    enableImplicitConversion: true,
  });
  return { dto, errors: validateSync(dto) };
}

describe('BooleanQuery', () => {
  it('treats "false" as false — the whole reason this exists', () => {
    const { dto, errors } = parse({ flag: 'false' });

    // With a plain @IsBoolean() + implicit conversion this is `true`,
    // which would invert a filter like ?bookableOnly=false.
    expect(dto.flag).toBe(false);
    expect(errors).toHaveLength(0);
  });

  it('treats "true" as true', () => {
    const { dto, errors } = parse({ flag: 'true' });
    expect(dto.flag).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('leaves the property absent when not supplied', () => {
    const { dto, errors } = parse({});
    expect(dto.flag).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  it('rejects a value that is neither true nor false instead of guessing', () => {
    const { errors } = parse({ flag: 'maybe' });
    expect(errors).toHaveLength(1);
  });

  it('accepts a real boolean unchanged', () => {
    expect(parse({ flag: true }).dto.flag).toBe(true);
    expect(parse({ flag: false }).dto.flag).toBe(false);
  });
});
