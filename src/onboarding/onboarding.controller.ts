import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('register-and-hire')
  @HttpCode(HttpStatus.CREATED)
  async registerAndHire(@Body() dto: RegisterAndHireDto) {
    return this.onboardingService.registerAndHire(dto);
  }
}
