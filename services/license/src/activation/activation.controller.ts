import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ActivationService } from "../domain/activation.service";
import { SignatureGuard } from "./signature.guard";
import { activateSchema, heartbeatSchema } from "./dto";
import { track } from "../telemetry";

@Controller("v1")
@UseGuards(SignatureGuard)
export class ActivationController {
  constructor(private readonly svc: ActivationService) {}

  @Post("activate")
  async activate(
    @Headers("x-product-key") productKey: string,
    @Body() body: unknown,
  ) {
    const dto = activateSchema.parse(body);
    const res = await this.svc.activate({ productKey, ...dto });
    track("activate", { ok: res.ok, reason: res.ok ? undefined : res.reason });
    if (!res.ok) throw new BadRequestException(res.reason);
    return res;
  }

  @Post("heartbeat")
  async heartbeat(
    @Headers("x-product-key") productKey: string,
    @Body() body: unknown,
  ) {
    const dto = heartbeatSchema.parse(body);
    const res = await this.svc.heartbeat({ productKey, ...dto });
    track("heartbeat", { ok: res.ok, reason: res.ok ? undefined : res.reason });
    if (!res.ok) throw new BadRequestException(res.reason);
    return res;
  }
}
