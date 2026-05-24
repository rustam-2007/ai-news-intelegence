import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({
    require_tld: false,
  })
  baseUrl!: string;

  @IsOptional()
  @IsIn(['RSS', 'HTML'])
  sourceType?: 'RSS' | 'HTML';

  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  rssUrl?: string;

  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  latestPageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  fetchIntervalMinutes?: number;
}
