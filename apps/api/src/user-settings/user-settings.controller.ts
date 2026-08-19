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

  /**
   * The caller's settings — created on the first request, with the language read from
   * `Accept-Language`.
   *
   * A GET that can write is deliberate, not an oversight. There is nothing for the client to
   * decide: every user has exactly one settings row, and asking it to POST one first would
   * add a round-trip whose only possible outcome is the row this call already returns. It
   * stays idempotent in the way that matters — the first call decides the language, every
   * later one only reads it, and the row is never duplicated.
   *
   * The caller comes from `@CurrentUserId()` alone. `Accept-Language` is a hint about
   * presentation, never identity: the worst a forged header can do is choose the language of
   * the sender's own settings row.
   */
  @Get()
  @ApiOperation({
    summary: "The caller's settings",
    description:
      'Creates the settings row on first call, taking the interface language from ' +
      '`Accept-Language`; afterwards it only reads. Never returns another user’s settings — ' +
      'the caller is the verified token’s subject and nothing else.',
  })
  // The name must match `@Headers('accept-language')` below **character for character**.
  // `@Headers()` makes the Swagger scanner derive a header parameter of its own, marked
  // required; `@ApiHeader` merges into it only on an exact name match, and otherwise both are
  // published — two entries for one case-insensitive header, one of them lying about being
  // required. `test/openapi.spec.ts` fails the gate on that, because the merge is invisible
  // here and the client generator hides it by collapsing the pair.
  @ApiHeader({
    name: 'accept-language',
    required: false,
    description:
      'Standard BCP 47 preference list, q-values included. Read only when the settings row ' +
      'does not exist yet; browsers send it on their own. Anything outside ru/en/pl — or a ' +
      'missing header — settles on `en`.',
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
