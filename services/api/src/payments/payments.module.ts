import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './payment-providers';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderRegistry],
  exports: [PaymentsService],
})
export class PaymentsModule {}
