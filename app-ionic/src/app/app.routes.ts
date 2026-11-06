
import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.page').then(m => m.HomePage)
  },
  {
    path: 'registro',
    loadComponent: () =>
      import('./pages/registro/registro.page')
        .then(m => m.RegistroPage)
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
