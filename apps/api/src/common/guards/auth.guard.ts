import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { EnvService } from '../../config/env.config';
import { DataSource } from 'typeorm';
import { User } from '../../modules/auth/entities/user.entity';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(JwtService)
    private jwtService: JwtService,
    @Inject(EnvService)
    private envService: EnvService,
    private readonly dataSource: DataSource
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      this.logger.warn(`Missing token for request: ${request.url}`);
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.envService.get('JWT_SECRET'),
      });

      const user = await this.dataSource.getRepository(User).findOne({
        where: { id: payload.sub },
        select: ['id', 'email', 'accountType', 'isActive'],
      });
      if (!user?.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      request['user'] = {
        id: user.id,
        email: user.email,
        accountType: user.accountType,
        staffId: payload.staffId ?? null,
        customerId: payload.customerId ?? null,
      };

      return true;
    } catch (error) {
      this.logger.warn(`Invalid token for request: ${request.url}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
