import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ToastService } from './core/services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly toastService = inject(ToastService);

  title = 'QWIK POS Admin';

  ngOnInit(): void {
    // Register the MessageService with the global ToastService
    this.toastService.setMessageService(this.messageService);
  }
}
