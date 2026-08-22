import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // W0-03a: AppModule's APP_CONFIG provider calls buildAppConfig() and throws
  // before any request can be served; fail fast on invalid profile/config.
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
