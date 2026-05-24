import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class FetchSourcesQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return true;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() !== 'false';
  })
  @IsBoolean()
  latestOnly = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 3;
}
