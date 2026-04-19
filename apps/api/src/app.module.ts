import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { EnvService } from './config/env.config';
import { getDatabaseConfig } from './config/database.config';
import { ConfigModule } from './config/config.module';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { RolesModule } from './modules/roles/roles.module';
import { BranchesModule } from './modules/branches/branches.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { SharedModule } from './modules/shared/shared.module';
import { ProductsModule } from './modules/products/products.module';
import { SiteModule } from './modules/site/site.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MessagesModule } from './modules/messages/messages.module';

// Guards, Interceptors, Filters
import { AuthGuard } from './common/guards/auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }),
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => getDatabaseConfig(envService),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    SharedModule,
    AuthModule,
    StaffModule,
    RolesModule,
    BranchesModule,
    AuditLogsModule,
    ProductsModule,
    SiteModule,
    CustomersModule,
    SalesModule,
    ExpensesModule,
    ProcurementModule,
    ReportsModule,
    DashboardModule,
    MessagesModule,
  ],
  controllers: [],
  providers: [
    // Global Auth Guard
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    // Global Throttler Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global Response Transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
