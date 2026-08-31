import { Global, Module } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { StorageService } from './services/storage.service';
import { PdfService } from './services/pdf.service';
import { BranchAccessService } from './services/branch-access.service';

import { MulterModule } from '@nestjs/platform-express';

@Global()
@Module({
  imports: [
    MulterModule.register({
      // No dest: use memory storage
    }),
  ],
  providers: [EmailService, StorageService, PdfService, BranchAccessService],
  exports: [EmailService, StorageService, PdfService, BranchAccessService, MulterModule],
})
export class SharedModule {}
