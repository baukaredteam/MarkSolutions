import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  BadRequestException,
  NotFoundException,
  Inject,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { Public } from "./public.decorator";
import { PrismaService } from "./prisma.service";
import { IEcomAdapter, ECOM_ADAPTER } from "./ecom.adapter";
import { provisionTenant } from "./provisioning";
import { AuthService } from "./auth.service";

interface CreateApplicationBody {
  name: string;
  bin: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  contact: string;
  consentDocument: string;
  consentSubject: string;
}

@Controller("onboarding/applications")
export class OnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ECOM_ADAPTER) private readonly ecom: IEcomAdapter
  ) {}

  @Public()
  @Post()
  async create(
    @Body() body: CreateApplicationBody,
    @Res({ passthrough: true }) res: Response
  ) {
    const required = [
      "name",
      "bin",
      "email",
      "phone",
      "city",
      "address",
      "contact",
      "consentDocument",
      "consentSubject",
    ];
    for (const k of required) {
      if (!body[k as keyof CreateApplicationBody]) {
        throw new BadRequestException(`field required: ${k}`);
      }
    }
    if (body.consentDocument !== "offer-v1") {
      throw new BadRequestException("consentDocument must be offer-v1");
    }

    // дубль по БИН (AT-02): возвращаем существующую заявку, не создаём вторую
    const existing = await this.prisma.application.findUnique({
      where: { bin: body.bin },
    });
    if (existing) {
      res.status(200);
      return existing;
    }

    const application = await this.prisma.application.create({
      data: {
        bin: body.bin,
        name: body.name,
        email: body.email,
        phone: body.phone,
        city: body.city,
        address: body.address,
        contact: body.contact,
        consentDocument: body.consentDocument,
        consentAcceptedAt: new Date(),
        consentSubject: body.consentSubject,
        ecomStatus: "PENDING",
        status: "PENDING",
      },
    });

    // проверка 1ecom (ADR-004): первый вызов → Pending External
    const ver = await this.ecom.verify(body.bin);
    await this.prisma.application.update({
      where: { id: application.id },
      data: { ecomStatus: ver.status },
    });

    return application;
  }

  @Public()
  @Get(":id")
  async get(@Param("id") id: string) {
    const app = await this.prisma.application.findFirst({
      where: { OR: [{ id }, { bin: id }] },
    });
    if (!app) throw new NotFoundException("application not found");
    return {
      id: app.id,
      status: app.status,
      timeline: [
        { at: app.createdAt.toISOString(), event: "Заявка создана" },
        { at: app.approvedAt?.toISOString() ?? "", event: "Одобрена" },
      ].filter((t) => t.at),
    };
  }
}

@Public()
@Controller("operator/approvals")
export class OperatorApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ECOM_ADAPTER) private readonly ecom: IEcomAdapter,
    private readonly auth: AuthService
  ) {}

  @Public()
  @HttpCode(200)
  @Post(":id")
  async approve(@Param("id") id: string, @Body() body: { decision: string }) {
    const application = await this.prisma.application.findUnique({
      where: { id },
    });
    if (!application) throw new NotFoundException("application not found");

    if (body.decision !== "approve") {
      await this.prisma.application.update({
        where: { id },
        data: { status: "REJECTED" },
      });
      return { id, status: "REJECTED" };
    }

    // ручной режим 1ecom (ADR-004): оператор завершает pending-проверку
    if (application.ecomStatus === "PENDING_EXTERNAL") {
      this.ecom.resolve(application.bin, "approve");
    }

    // идемпотентность: если tenant уже создан — возвращаем как есть
    if (application.tenantId) {
      return { id, status: application.status, tenantId: application.tenantId };
    }

    const result = await provisionTenant(this.prisma, {
      bin: application.bin,
      name: application.name,
      adminLogin: `admin@${application.bin}`,
      adminPasswordHash: AuthService.hashPassword("demo-password"),
    });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        tenantId: result.tenantId,
      },
    });

    return { id, status: updated.status, tenantId: result.tenantId };
  }
}
