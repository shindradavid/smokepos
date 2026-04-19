import { Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';

export const MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/messages-page/messages-page.component').then((m) => m.MessagesPageComponent),
    canActivate: [PermissionGuard],
    data: { permission: 'message.view' },
  },
];
