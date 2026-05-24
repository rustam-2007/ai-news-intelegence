import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({
    require_tld: false,
  })
  baseUrl!: string;

  @IsUrl({
    require_tld: false,
  })
  rssUrl!: string;

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
