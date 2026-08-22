import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { CurrentUserId } from '@/auth/current-user.decorator';
import { UnauthorizedResponse } from '@/auth/unauthorized.response';
import { detectLanguageTag } from '@/user-settings/accept-language';
import { UserSettingsResponse } from '@/user-settings/user-settings.response';
import { UserSettingsService } from '@/user-settings/user-settings.service';

@Controller('user-settings')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get()
  @ApiOperation({
    summary: "The caller's settings",
    description:
      'Creates the settings row on first call, taking the interface language from ' +
      "`Accept-Language`; afterwards it only reads. It never returns another user's settings. " +
      "The caller is the verified token's subject and nothing else.",
  })
  @ApiHeader({
    name: 'accept-language',
    required: false,
    description:
      'Standard BCP 47 preference list, q-values included. Read only when the settings row ' +
      'does not exist yet; browsers send it on their own. Anything outside ru/en/pl, or a ' +
      'missing header, settles on `en`.',
  })
  @ApiOkResponse({ description: 'The settings that exist now.', type: UserSettingsResponse })
  @ApiUnauthorizedResponse({
    description: 'The token was missing, malformed, expired or not minted for this app.',
    type: UnauthorizedResponse,
  })
  read(
    @CurrentUserId() userId: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<UserSettingsResponse> {
    return this.settings.readOrCreate(userId, detectLanguageTag(acceptLanguage));
  }
}
