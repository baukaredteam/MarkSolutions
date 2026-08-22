import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, buildAppConfig } from "./config-validation";

// W0-03a: APP_CONFIG is registered as a global provider so every DI factory
// (JwtModule.registerAsync, KMS, storage, MPT, readiness) can inject it without
// reading process.env / ConfigService for selection.
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => buildAppConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
