import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { validateProductionConfig } from "./config-validation";

async function bootstrap() {
  // W0-01: fail-fast configuration validation before any request can be served
  validateProductionConfig();

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
